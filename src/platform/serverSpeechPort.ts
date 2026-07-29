import type {
  SpeechAudioContext,
  SpeechOptions,
  SpeechPort,
  SpeechResult
} from './speechPort'
import { getCommunicationEnhancementLimitMessage } from './communicationEnhancementError'

interface ServerSpeechResponse {
  statusCode: number
  data: unknown
}

interface ServerSpeechDependencies {
  apiBaseUrl: string
  getAuthToken: () => string
  request: (options: {
    url: string
    method: 'POST'
    data: {
      text: string
      rate?: number
      voice?: string
    }
    header: Record<string, string>
    responseType: 'arraybuffer'
  }) => Promise<ServerSpeechResponse>
  writeTempAudio: (data: ArrayBuffer) => Promise<string>
  unlinkFile: (filePath: string) => Promise<void>
  createInnerAudioContext: () => SpeechAudioContext
  setTimer: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  timeoutMs: number
}

const MAX_SPEECH_TEXT_LENGTH = 300
const MAX_SPEECH_AUDIO_BYTES = 8 * 1024 * 1024

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function hasHttpOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function normalizeRate(options: SpeechOptions) {
  const rate = Number(options.rate)
  return Number.isFinite(rate)
    ? Math.max(0.5, Math.min(2, rate))
    : undefined
}

function normalizeVoice(options: SpeechOptions) {
  return typeof options.voice === 'string'
    ? options.voice.trim().slice(0, 80)
    : ''
}

function serverFailure(statusCode: number, responseData: unknown): SpeechResult {
  const limitMessage = getCommunicationEnhancementLimitMessage(
    statusCode,
    responseData,
    '请使用微信朗读，或稍后再试服务端音色。'
  )
  if (limitMessage) {
    return {
      ok: false,
      message: limitMessage,
      reason: 'provider'
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return {
      ok: false,
      message: '登录后可使用 cboard-api 语音回退。',
      reason: 'unavailable'
    }
  }
  if (statusCode === 503) {
    return {
      ok: false,
      message: '服务端尚未配置语音模型。',
      reason: 'unavailable'
    }
  }
  return {
    ok: false,
    message: '服务端语音暂时不可用，请重试。',
    reason: 'provider'
  }
}

export function createServerSpeechPort(
  dependencies: ServerSpeechDependencies
): SpeechPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = hasHttpOrigin(apiBaseUrl)
  let generation = 0
  let activeAudio: SpeechAudioContext | null = null
  let activeFilePath = ''
  let activeTimer: ReturnType<typeof setTimeout> | null = null
  let settleActive: ((result: SpeechResult) => void) | null = null

  const releaseAudio = () => {
    if (!activeAudio) return
    try {
      activeAudio.stop()
    } catch (error) {
      // Playback can already be stopped by the platform.
    }
    try {
      activeAudio.destroy()
    } catch (error) {
      // Destruction is best-effort on older base-library versions.
    }
    activeAudio = null
  }

  const finish = async (result: SpeechResult) => {
    const settle = settleActive
    if (!settle) return
    settleActive = null
    generation += 1
    if (activeTimer) {
      dependencies.clearTimer(activeTimer)
      activeTimer = null
    }
    const filePath = activeFilePath
    activeFilePath = ''
    releaseAudio()
    if (filePath) {
      try {
        await dependencies.unlinkFile(filePath)
      } catch (error) {
        // A cleanup failure must not leave the communication UI busy.
      }
    }
    settle(result)
  }

  const stop = () => {
    generation += 1
    if (!settleActive && !activeAudio && !activeFilePath) return
    void finish({
      ok: false,
      message: '朗读已停止。',
      reason: 'stopped'
    })
  }

  return {
    available: configured,

    async speak(text, options = {}) {
      const content = String(text || '').trim()
      if (!content || content.length > MAX_SPEECH_TEXT_LENGTH) {
        return {
          ok: false,
          message: '朗读文字需为 1 至 300 个字符。',
          reason: 'invalid'
        }
      }
      if (!configured) {
        return {
          ok: false,
          message: '尚未配置手机可访问的 cboard-api。',
          reason: 'unavailable'
        }
      }

      const token = String(dependencies.getAuthToken() || '').trim()
      if (!token) {
        return {
          ok: false,
          message: '登录后可使用 cboard-api 语音回退。',
          reason: 'unavailable'
        }
      }

      stop()
      const requestGeneration = generation

      return new Promise(resolve => {
        settleActive = resolve
        activeTimer = dependencies.setTimer(() => {
          if (requestGeneration !== generation) return
          void finish({
            ok: false,
            message: '服务端朗读等待超时，请重试。',
            reason: 'timeout'
          })
        }, dependencies.timeoutMs)

        void (async () => {
          const rate = normalizeRate(options)
          const voice = normalizeVoice(options)
          let response
          try {
            response = await dependencies.request({
              url: apiBaseUrl + '/gpt/communication/speech',
              method: 'POST',
              data: {
                text: content,
                ...(rate === undefined ? {} : { rate }),
                ...(voice ? { voice } : {})
              },
              header: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token
              },
              responseType: 'arraybuffer'
            })
          } catch (error) {
            if (requestGeneration === generation) {
              await finish({
                ok: false,
                message: '网络不可用，服务端朗读失败。',
                reason: 'network'
              })
            }
            return
          }

          if (requestGeneration !== generation) return
          if (response.statusCode < 200 || response.statusCode >= 300) {
            await finish(serverFailure(response.statusCode, response.data))
            return
          }
          if (
            !(response.data instanceof ArrayBuffer) ||
            !response.data.byteLength ||
            response.data.byteLength > MAX_SPEECH_AUDIO_BYTES
          ) {
            await finish({
              ok: false,
              message: '服务端返回的语音文件无效。',
              reason: 'provider'
            })
            return
          }

          let filePath = ''
          try {
            filePath = await dependencies.writeTempAudio(response.data)
          } catch (error) {
            await finish({
              ok: false,
              message: '语音临时文件保存失败。',
              reason: 'playback'
            })
            return
          }

          if (requestGeneration !== generation) {
            try {
              await dependencies.unlinkFile(filePath)
            } catch (error) {
              // Stale files are best-effort cleanup.
            }
            return
          }

          try {
            const audio = dependencies.createInnerAudioContext()
            activeAudio = audio
            activeFilePath = filePath
            audio.autoplay = false
            audio.onEnded(() => {
              if (requestGeneration !== generation) return
              void finish({ ok: true, message: '朗读完成。' })
            })
            audio.onError(() => {
              if (requestGeneration !== generation) return
              void finish({
                ok: false,
                message: '服务端语音播放失败，请重试。',
                reason: 'playback'
              })
            })
            audio.src = filePath
            audio.play()
          } catch (error) {
            activeFilePath = filePath
            await finish({
              ok: false,
              message: '无法启动服务端语音播放。',
              reason: 'playback'
            })
          }
        })()
      })
    },

    stop
  }
}
