import {
  MAX_DIALECT_AUDIO_DURATION_MS,
  normalizeDialectAudioRecognitionResponse,
  validateDialectAudioFile,
  type DialectAudioRecognitionResponse
} from '@cboard-communication-core/dialectAudioRecognition'
import { getCommunicationEnhancementLimitMessage } from './communicationEnhancementError'

export interface DialectAudioRecognitionResult {
  ok: boolean
  message: string
  value?: DialectAudioRecognitionResponse
}

export interface DialectAudioRecorderStopEvent {
  tempFilePath?: string
  duration?: number
  fileSize?: number
}

export interface DialectAudioRecorderError {
  errMsg?: string
}

export interface DialectAudioRecorderManager {
  onStart(callback: () => void): void
  onStop(callback: (event: DialectAudioRecorderStopEvent) => void): void
  onError(callback: (error: DialectAudioRecorderError) => void): void
  offStart?(callback: () => void): void
  offStop?(callback: (event: DialectAudioRecorderStopEvent) => void): void
  offError?(callback: (error: DialectAudioRecorderError) => void): void
  start(options: {
    duration: number
    sampleRate: 16000
    numberOfChannels: 1
    encodeBitRate: 48000
    format: 'mp3'
  }): void
  stop(): void
}

interface DialectAudioRecognitionDependencies {
  apiBaseUrl: string
  getAuthToken: () => string
  getRecorderManager: () => DialectAudioRecorderManager
  getFileSize: (filePath: string) => Promise<number>
  uploadFile: (options: {
    url: string
    filePath: string
    name: 'audio'
    header: Record<string, string>
    timeout: number
  }) => Promise<{ statusCode: number; data: unknown }>
  unlinkFile: (filePath: string) => Promise<void>
  setTimer: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  cancelCleanupDelayMs: number
}

interface ActiveRequest {
  generation: number
  manager: DialectAudioRecorderManager
  resolve: (result: DialectAudioRecognitionResult) => void
  settled: boolean
  cancelled: boolean
  stopping: boolean
  phase: 'recording' | 'uploading'
  tempFilePath: string
  cancelTimer: ReturnType<typeof setTimeout> | null
  handleStart: () => void
  handleStop: (event: DialectAudioRecorderStopEvent) => void
  handleError: (error: DialectAudioRecorderError) => void
}

export interface DialectAudioRecognitionPort {
  readonly configured: boolean
  start(options: {
    consent: boolean
  }): Promise<DialectAudioRecognitionResult>
  stop(): void
  cancel(): void
}

const RECORDING_DURATION_MS = 30_000
const UPLOAD_TIMEOUT_MS = 45_000

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function hasHttpOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function parseResponseData(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch (error) {
    return null
  }
}

function getErrorMessage(statusCode: number, responseData: unknown) {
  const limitMessage = getCommunicationEnhancementLimitMessage(
    statusCode,
    responseData,
    '请继续手工输入，或稍后重试录音识别。'
  )
  if (limitMessage) return limitMessage
  if (statusCode === 401 || statusCode === 403) {
    return '登录已失效，请重新登录后使用粤语录音识别。'
  }
  if (statusCode === 413) return '粤语录音不能超过 3 MiB。'
  if (statusCode === 415) return '录音格式无效，请重新录制。'
  if (statusCode === 422) return '没有识别到粤语，请靠近麦克风重试。'
  if (statusCode === 503) {
    return '服务端尚未配置粤语录音识别，请继续手工输入。'
  }
  return '粤语录音识别暂时不可用，请继续手工输入。'
}

export function createDialectAudioRecognitionPort(
  dependencies: DialectAudioRecognitionDependencies
): DialectAudioRecognitionPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = hasHttpOrigin(apiBaseUrl)
  let generation = 0
  let active: ActiveRequest | null = null

  const safeUnlink = async (filePath: string) => {
    if (!filePath) return
    try {
      await dependencies.unlinkFile(filePath)
    } catch (error) {
      // Temporary recorder cleanup must not overwrite the recognition result.
    }
  }

  const detachListeners = (request: ActiveRequest) => {
    if (typeof request.manager.offStart === 'function') {
      request.manager.offStart(request.handleStart)
    }
    if (typeof request.manager.offStop === 'function') {
      request.manager.offStop(request.handleStop)
    }
    if (typeof request.manager.offError === 'function') {
      request.manager.offError(request.handleError)
    }
  }

  const clearActive = (request: ActiveRequest) => {
    if (request.cancelTimer) {
      dependencies.clearTimer(request.cancelTimer)
      request.cancelTimer = null
    }
    detachListeners(request)
    if (active === request) active = null
  }

  const settle = (
    request: ActiveRequest,
    result: DialectAudioRecognitionResult
  ) => {
    if (request.settled) return
    request.settled = true
    request.resolve(result)
  }

  const cancel = () => {
    const request = active
    if (!request || request.cancelled) return

    request.cancelled = true
    settle(request, {
      ok: false,
      message: '粤语录音识别已取消。'
    })

    if (request.phase === 'recording') {
      try {
        request.manager.stop()
        request.cancelTimer = dependencies.setTimer(
          () => clearActive(request),
          dependencies.cancelCleanupDelayMs
        )
      } catch (error) {
        clearActive(request)
      }
    }
  }

  return {
    configured,

    start({ consent }) {
      if (!consent) {
        return Promise.resolve({
          ok: false,
          message: '请先同意本次录音发送到服务端和外部语音提供方。'
        })
      }
      if (!configured) {
        return Promise.resolve({
          ok: false,
          message: '粤语录音识别服务尚未配置，请继续手工输入。'
        })
      }
      const token = String(dependencies.getAuthToken() || '').trim()
      if (!token) {
        return Promise.resolve({
          ok: false,
          message: '登录后可使用粤语录音识别，当前仍可手工输入。'
        })
      }
      if (active) {
        return Promise.resolve({
          ok: false,
          message: '上一段粤语录音仍在结束，请稍后再试。'
        })
      }

      let manager: DialectAudioRecorderManager
      try {
        manager = dependencies.getRecorderManager()
      } catch (error) {
        return Promise.resolve({
          ok: false,
          message: '无法打开麦克风，请检查权限后重试。'
        })
      }

      generation += 1
      const requestGeneration = generation

      return new Promise(resolve => {
        const handleStart = () => {}
        let request: ActiveRequest

        const handleStop = (event: DialectAudioRecorderStopEvent) => {
          void (async () => {
            const filePath = String(event.tempFilePath || '').trim()
            request.tempFilePath = filePath
            request.phase = 'uploading'
            if (request.cancelTimer) {
              dependencies.clearTimer(request.cancelTimer)
              request.cancelTimer = null
            }

            if (
              request.cancelled ||
              active !== request ||
              request.generation !== requestGeneration
            ) {
              await safeUnlink(filePath)
              clearActive(request)
              return
            }

            try {
              const duration = Number(event.duration)
              if (
                Number.isFinite(duration) &&
                (duration < 0 ||
                  duration > MAX_DIALECT_AUDIO_DURATION_MS)
              ) {
                settle(request, {
                  ok: false,
                  message: '录音时长无效，请重新录制。'
                })
                return
              }

              let fileSize = Number(event.fileSize)
              if (!Number.isFinite(fileSize) || fileSize <= 0) {
                fileSize = await dependencies.getFileSize(filePath)
              }
              const validation = validateDialectAudioFile({
                type: 'audio/mpeg',
                size: fileSize
              })
              if (!filePath || !validation.valid) {
                settle(request, {
                  ok: false,
                  message:
                    validation.message || '没有读取到有效的粤语录音。'
                })
                return
              }

              const response = await dependencies.uploadFile({
                url: apiBaseUrl + '/gpt/communication/dialect-asr',
                filePath,
                name: 'audio',
                header: {
                  Authorization: `Bearer ${token}`
                },
                timeout: UPLOAD_TIMEOUT_MS
              })
              if (
                request.cancelled ||
                active !== request ||
                request.generation !== requestGeneration
              ) {
                return
              }
              if (
                response.statusCode < 200 ||
                response.statusCode >= 300
              ) {
                settle(request, {
                  ok: false,
                  message: getErrorMessage(
                    response.statusCode,
                    response.data
                  )
                })
                return
              }

              const payload = parseResponseData(response.data)
              const value =
                normalizeDialectAudioRecognitionResponse(payload || {})
              if (!value) {
                settle(request, {
                  ok: false,
                  message:
                    '服务端返回的粤语识别结果无效，请继续手工输入。'
                })
                return
              }

              settle(request, {
                ok: true,
                message: '粤语识别原文已返回，请人工确认。',
                value
              })
            } catch (error) {
              settle(request, {
                ok: false,
                message:
                  '粤语录音读取或上传失败，请检查网络后重试。'
              })
            } finally {
              await safeUnlink(filePath)
              clearActive(request)
            }
          })()
        }

        const handleError = () => {
          settle(request, {
            ok: false,
            message: '粤语录音失败，请检查麦克风权限后重试。'
          })
          void safeUnlink(request.tempFilePath)
          clearActive(request)
        }

        request = {
          generation: requestGeneration,
          manager,
          resolve,
          settled: false,
          cancelled: false,
          stopping: false,
          phase: 'recording',
          tempFilePath: '',
          cancelTimer: null,
          handleStart,
          handleStop,
          handleError
        }
        active = request
        manager.onStart(handleStart)
        manager.onStop(handleStop)
        manager.onError(handleError)

        try {
          manager.start({
            duration: RECORDING_DURATION_MS,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'mp3'
          })
        } catch (error) {
          settle(request, {
            ok: false,
            message: '无法开始粤语录音，请检查麦克风权限后重试。'
          })
          clearActive(request)
        }
      })
    },

    stop() {
      const request = active
      if (
        !request ||
        request.cancelled ||
        request.stopping ||
        request.phase !== 'recording'
      ) {
        return
      }
      request.stopping = true
      try {
        request.manager.stop()
      } catch (error) {
        settle(request, {
          ok: false,
          message: '无法结束粤语录音，请重新录制。'
        })
        clearActive(request)
      }
    },

    cancel
  }
}
