export interface SpeechResult {
  ok: boolean
  message: string
  reason?:
    | 'invalid'
    | 'unavailable'
    | 'provider'
    | 'playback'
    | 'timeout'
    | 'stopped'
    | 'network'
}

export interface SpeechOptions {
  rate?: number
  voice?: string
}

export interface SpeechPort {
  readonly available: boolean
  speak(text: string, options?: SpeechOptions): Promise<SpeechResult>
  stop(): void
}

export interface WechatSITextToSpeechResult {
  retcode?: number
  filename?: string
}

export interface WechatSIPlugin {
  textToSpeech(options: {
    lang: 'zh_CN'
    tts: true
    content: string
    success: (result: WechatSITextToSpeechResult) => void
    fail: () => void
  }): void
}

export interface SpeechAudioError {
  errMsg?: string
}

export interface SpeechAudioContext {
  src: string
  autoplay: boolean
  playbackRate?: number
  play(): void
  stop(): void
  destroy(): void
  onEnded(callback: () => void): void
  onError(callback: (error: SpeechAudioError) => void): void
}

export interface WechatSpeechDependencies {
  requirePlugin(name: 'WechatSI'): WechatSIPlugin
  createInnerAudioContext(): SpeechAudioContext
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimer(timer: ReturnType<typeof setTimeout>): void
  timeoutMs: number
}

const WECHAT_SI_UNAVAILABLE_MESSAGE =
  '当前小程序尚未启用微信语音插件。请使用正式 AppID，并在公众平台添加“微信同声传译”插件。'

export function createWechatSpeechPort(
  dependencies: WechatSpeechDependencies
): SpeechPort {
  let generation = 0
  let activeAudio: SpeechAudioContext | null = null
  let activeTimer: ReturnType<typeof setTimeout> | null = null
  let settleActive: ((result: SpeechResult) => void) | null = null

  const releaseAudio = () => {
    if (!activeAudio) return
    try {
      activeAudio.stop()
    } catch (error) {
      // The context can already be stopped when playback finishes.
    }
    try {
      activeAudio.destroy()
    } catch (error) {
      // Destruction is best-effort on older base-library versions.
    }
    activeAudio = null
  }

  const finish = (result: SpeechResult) => {
    if (activeTimer) {
      dependencies.clearTimer(activeTimer)
      activeTimer = null
    }
    const settle = settleActive
    settleActive = null
    generation += 1
    releaseAudio()
    if (settle) settle(result)
  }

  const stop = () => {
    generation += 1
    if (!settleActive && !activeAudio) return
    finish({ ok: false, message: '朗读已停止。', reason: 'stopped' })
  }

  const getPlugin = () => {
    try {
      return dependencies.requirePlugin('WechatSI')
    } catch (error) {
      return null
    }
  }

  return {
    get available() {
      return Boolean(getPlugin())
    },

    async speak(text, options = {}) {
      const content = text.trim()
      if (!content) {
        return {
          ok: false,
          message: '没有可朗读的文字。',
          reason: 'invalid'
        }
      }

      const plugin = getPlugin()
      if (!plugin) {
        return {
          ok: false,
          message: WECHAT_SI_UNAVAILABLE_MESSAGE,
          reason: 'unavailable'
        }
      }

      stop()
      const requestGeneration = generation

      return new Promise(resolve => {
        settleActive = resolve
        activeTimer = dependencies.setTimer(() => {
          if (requestGeneration !== generation) return
          finish({
            ok: false,
            message: '朗读等待超时，请重试。',
            reason: 'timeout'
          })
        }, dependencies.timeoutMs)

        try {
          plugin.textToSpeech({
            lang: 'zh_CN',
            tts: true,
            content,
            success(result) {
              if (requestGeneration !== generation) return
              const hasErrorCode =
                typeof result.retcode === 'number' && result.retcode !== 0
              if (hasErrorCode || !result.filename) {
                finish({
                  ok: false,
                  message: '语音生成失败，请重试。',
                  reason: 'provider'
                })
                return
              }

              try {
                const audio = dependencies.createInnerAudioContext()
                activeAudio = audio
                audio.autoplay = false
                const requestedRate = Number(options.rate)
                if (Number.isFinite(requestedRate)) {
                  audio.playbackRate = Math.max(0.5, Math.min(2, requestedRate))
                }
                audio.onEnded(() => {
                  if (requestGeneration !== generation) return
                  finish({ ok: true, message: '朗读完成。' })
                })
                audio.onError(() => {
                  if (requestGeneration !== generation) return
                  finish({
                    ok: false,
                    message: '语音播放失败，请重试。',
                    reason: 'playback'
                  })
                })
                audio.src = result.filename
                audio.play()
              } catch (error) {
                finish({
                  ok: false,
                  message: '无法启动语音播放，请重试。',
                  reason: 'playback'
                })
              }
            },
            fail() {
              if (requestGeneration !== generation) return
              finish({
                ok: false,
                message: '语音生成失败，请检查网络后重试。',
                reason: 'provider'
              })
            }
          })
        } catch (error) {
          finish({
            ok: false,
            message: WECHAT_SI_UNAVAILABLE_MESSAGE,
            reason: 'unavailable'
          })
        }
      })
    },

    stop
  }
}
