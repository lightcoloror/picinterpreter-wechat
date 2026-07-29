export interface RecognitionResult {
  ok: boolean
  text: string
  message: string
}

export interface RecognitionPort {
  readonly available: boolean
  start(onInterim?: (text: string) => void): Promise<RecognitionResult>
  stop(): void
  cancel(): void
}

export interface WechatSIRecognitionEvent {
  result?: string
}

export interface WechatSIRecognitionError {
  retcode?: number
  msg?: string
}

export interface WechatSIRecognitionManager {
  onStart?: (event: { msg?: string }) => void
  onRecognize?: (event: WechatSIRecognitionEvent) => void
  onStop?: (event: WechatSIRecognitionEvent) => void
  onError?: (event: WechatSIRecognitionError) => void
  start(options: { duration: number; lang: 'zh_CN' }): void
  stop(): void
}

export interface WechatSIRecognitionPlugin {
  getRecordRecognitionManager(): WechatSIRecognitionManager
}

export interface WechatRecognitionDependencies {
  requirePlugin(name: 'WechatSI'): WechatSIRecognitionPlugin
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimer(timer: ReturnType<typeof setTimeout>): void
  durationMs: number
  timeoutMs: number
}

export const WECHAT_RECOGNITION_UNAVAILABLE_MESSAGE =
  '当前小程序尚未启用微信语音输入。请使用正式 AppID，并在公众平台添加“微信同声传译”插件。'

interface ActiveRecognition {
  generation: number
  manager: WechatSIRecognitionManager
  resolve: (result: RecognitionResult) => void
  timer: ReturnType<typeof setTimeout>
  stopping: boolean
}

export function createWechatRecognitionPort(
  dependencies: WechatRecognitionDependencies
): RecognitionPort {
  let generation = 0
  let active: ActiveRecognition | null = null

  const getPlugin = () => {
    try {
      const plugin = dependencies.requirePlugin('WechatSI')
      return Boolean(
        plugin && typeof plugin.getRecordRecognitionManager === 'function'
      )
        ? plugin
        : null
    } catch (error) {
      return null
    }
  }

  const settle = (
    requestGeneration: number,
    result: RecognitionResult,
    stopManager = false
  ) => {
    if (!active || active.generation !== requestGeneration) return

    const request = active
    active = null
    dependencies.clearTimer(request.timer)

    if (stopManager) {
      try {
        request.manager.stop()
      } catch (error) {
        // The recorder can already be stopped when a timeout or cancel wins.
      }
    }

    request.resolve(result)
  }

  const cancel = () => {
    if (!active) return

    const request = active
    active = null
    generation += 1
    dependencies.clearTimer(request.timer)

    try {
      request.manager.stop()
    } catch (error) {
      // Cancellation is best-effort and must still settle the caller.
    }

    request.resolve({
      ok: false,
      text: '',
      message: '语音输入已取消。'
    })
  }

  return {
    get available() {
      return Boolean(getPlugin())
    },

    start(onInterim) {
      cancel()

      const plugin = getPlugin()
      if (!plugin) {
        return Promise.resolve({
          ok: false,
          text: '',
          message: WECHAT_RECOGNITION_UNAVAILABLE_MESSAGE
        })
      }

      let manager: WechatSIRecognitionManager
      try {
        manager = plugin.getRecordRecognitionManager()
      } catch (error) {
        return Promise.resolve({
          ok: false,
          text: '',
          message: WECHAT_RECOGNITION_UNAVAILABLE_MESSAGE
        })
      }

      generation += 1
      const requestGeneration = generation
      let lastInterimText = ''

      return new Promise(resolve => {
        const timer = dependencies.setTimer(() => {
          settle(
            requestGeneration,
            {
              ok: false,
              text: '',
              message: '语音识别等待超时，请再试一次。'
            },
            true
          )
        }, dependencies.timeoutMs)

        active = {
          generation: requestGeneration,
          manager,
          resolve,
          timer,
          stopping: false
        }

        manager.onRecognize = event => {
          if (!active || active.generation !== requestGeneration) return
          const interimText = String(event.result || '').trim()
          if (
            !interimText ||
            interimText === lastInterimText ||
            !onInterim
          ) {
            return
          }
          lastInterimText = interimText
          onInterim(interimText)
        }

        manager.onStop = event => {
          const text = String(event.result || '').trim()
          settle(requestGeneration, {
            ok: Boolean(text),
            text,
            message: text
              ? '语音识别完成。'
              : '没有识别到语音，请再试一次。'
          })
        }

        manager.onError = () => {
          settle(requestGeneration, {
            ok: false,
            text: '',
            message: '语音输入失败，请检查麦克风权限和网络后重试。'
          })
        }

        try {
          manager.start({
            duration: dependencies.durationMs,
            lang: 'zh_CN'
          })
        } catch (error) {
          settle(requestGeneration, {
            ok: false,
            text: '',
            message: WECHAT_RECOGNITION_UNAVAILABLE_MESSAGE
          })
        }
      })
    },

    stop() {
      if (!active || active.stopping) return
      active.stopping = true

      try {
        active.manager.stop()
      } catch (error) {
        settle(active.generation, {
          ok: false,
          text: '',
          message: '无法结束语音输入，请再试一次。'
        })
      }
    },

    cancel
  }
}
