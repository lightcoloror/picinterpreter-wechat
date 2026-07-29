import type {
  DialectAudioRecorderManager,
  DialectAudioRecorderStopEvent
} from './dialectAudioRecognitionPort'

export interface TileAudioRecordingResult {
  ok: boolean
  message: string
  sound?: string
}

interface TileAudioRecordingDependencies {
  getRecorderManager: () => DialectAudioRecorderManager
  getFileSize: (filePath: string) => Promise<number>
  saveFile: (tempFilePath: string) => Promise<{ savedFilePath: string }>
  removeFile: (filePath: string) => Promise<void>
  setTimer: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  cancelCleanupDelayMs: number
}

interface ActiveRecording {
  manager: DialectAudioRecorderManager
  resolve: (result: TileAudioRecordingResult) => void
  settled: boolean
  cancelled: boolean
  stopping: boolean
  cancelTimer: ReturnType<typeof setTimeout> | null
  handleStart: () => void
  handleStop: (event: DialectAudioRecorderStopEvent) => void
  handleError: () => void
}

export interface TileAudioRecordingPort {
  start(): Promise<TileAudioRecordingResult>
  stop(): void
  cancel(): void
  remove(sound: string): Promise<boolean>
}

const RECORDING_DURATION_MS = 30_000
const MIN_RECORDING_DURATION_MS = 250
const MAX_RECORDING_SIZE = 5 * 1024 * 1024

export function createTileAudioRecordingPort(
  dependencies: TileAudioRecordingDependencies
): TileAudioRecordingPort {
  let active: ActiveRecording | null = null

  const safeRemove = async (filePath: string) => {
    if (!filePath) return false
    try {
      await dependencies.removeFile(filePath)
      return true
    } catch (error) {
      return false
    }
  }

  const detach = (request: ActiveRecording) => {
    if (request.manager.offStart) {
      request.manager.offStart(request.handleStart)
    }
    if (request.manager.offStop) {
      request.manager.offStop(request.handleStop)
    }
    if (request.manager.offError) {
      request.manager.offError(request.handleError)
    }
  }

  const clearActive = (request: ActiveRecording) => {
    if (request.cancelTimer) {
      dependencies.clearTimer(request.cancelTimer)
      request.cancelTimer = null
    }
    detach(request)
    if (active === request) active = null
  }

  const settle = (
    request: ActiveRecording,
    result: TileAudioRecordingResult
  ) => {
    if (request.settled) return
    request.settled = true
    request.resolve(result)
  }

  return {
    start() {
      if (active) {
        return Promise.resolve({
          ok: false,
          message: '上一段图卡录音仍在结束，请稍后再试。'
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

      return new Promise(resolve => {
        let request: ActiveRecording
        const handleStart = () => {}
        const handleStop = (event: DialectAudioRecorderStopEvent) => {
          void (async () => {
            const tempFilePath = String(event.tempFilePath || '').trim()
            if (request.cancelled) {
              await safeRemove(tempFilePath)
              clearActive(request)
              return
            }

            let savedFilePath = ''
            try {
              const duration = Number(event.duration)
              if (
                !Number.isFinite(duration) ||
                duration < MIN_RECORDING_DURATION_MS ||
                duration > RECORDING_DURATION_MS
              ) {
                settle(request, {
                  ok: false,
                  message: '录音太短或时长无效，请重新录制。'
                })
                return
              }

              if (!tempFilePath) {
                settle(request, {
                  ok: false,
                  message: '没有读取到有效录音，或录音超过 5 MiB。'
                })
                return
              }

              let fileSize = Number(event.fileSize)
              if (!Number.isFinite(fileSize) || fileSize <= 0) {
                fileSize = await dependencies.getFileSize(tempFilePath)
              }
              if (
                !Number.isFinite(fileSize) ||
                fileSize <= 0 ||
                fileSize > MAX_RECORDING_SIZE
              ) {
                settle(request, {
                  ok: false,
                  message: '没有读取到有效录音，或录音超过 5 MiB。'
                })
                return
              }

              const saved = await dependencies.saveFile(tempFilePath)
              savedFilePath = String(
                (saved && saved.savedFilePath) || ''
              ).trim()
              if (!savedFilePath) {
                settle(request, {
                  ok: false,
                  message: '录音无法保存到当前微信设备。'
                })
                return
              }
              if (request.cancelled) {
                await safeRemove(savedFilePath)
                return
              }
              settle(request, {
                ok: true,
                message: '图卡录音已保存，请试听后再保存图卡。',
                sound: savedFilePath
              })
            } catch (error) {
              settle(request, {
                ok: false,
                message: '图卡录音读取或保存失败，请稍后重试。'
              })
            } finally {
              if (
                tempFilePath &&
                tempFilePath !== savedFilePath
              ) {
                await safeRemove(tempFilePath)
              }
              clearActive(request)
            }
          })()
        }
        const handleError = () => {
          settle(request, {
            ok: false,
            message: '图卡录音失败，请检查麦克风权限后重试。'
          })
          clearActive(request)
        }

        request = {
          manager,
          resolve,
          settled: false,
          cancelled: false,
          stopping: false,
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
            message: '无法开始图卡录音，请检查麦克风权限后重试。'
          })
          clearActive(request)
        }
      })
    },

    stop() {
      const request = active
      if (!request || request.cancelled || request.stopping) return
      request.stopping = true
      try {
        request.manager.stop()
      } catch (error) {
        settle(request, {
          ok: false,
          message: '无法结束图卡录音，请重新录制。'
        })
        clearActive(request)
      }
    },

    cancel() {
      const request = active
      if (!request || request.cancelled) return
      request.cancelled = true
      settle(request, {
        ok: false,
        message: '图卡录音已取消。'
      })
      try {
        request.manager.stop()
        request.cancelTimer = dependencies.setTimer(
          () => clearActive(request),
          dependencies.cancelCleanupDelayMs
        )
      } catch (error) {
        clearActive(request)
      }
    },

    remove(sound) {
      return safeRemove(String(sound || '').trim())
    }
  }
}
