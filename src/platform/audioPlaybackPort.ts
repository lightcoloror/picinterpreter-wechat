import type {
  SpeechAudioContext,
  SpeechOptions,
  SpeechResult
} from './speechPort'

export interface AudioPlaybackPort {
  readonly available: boolean
  play(source: string, options?: SpeechOptions): Promise<SpeechResult>
  stop(): void
}

export interface AudioPlaybackDependencies {
  createInnerAudioContext(): SpeechAudioContext
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimer(timer: ReturnType<typeof setTimeout>): void
  timeoutMs: number
}

export function createWechatAudioPlaybackPort(
  dependencies: AudioPlaybackDependencies
): AudioPlaybackPort {
  let generation = 0
  let activeAudio: SpeechAudioContext | null = null
  let activeTimer: ReturnType<typeof setTimeout> | null = null
  let settleActive: ((result: SpeechResult) => void) | null = null

  const releaseAudio = () => {
    if (!activeAudio) return
    try {
      activeAudio.stop()
    } catch (error) {
      // A completed context can already be stopped.
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

  return {
    available: true,

    async play(source, options = {}) {
      const audioSource = String(source || '').trim()
      if (!audioSource) {
        return {
          ok: false,
          message: '个性录音地址无效。',
          reason: 'invalid'
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
            message: '个性录音播放超时。',
            reason: 'timeout'
          })
        }, dependencies.timeoutMs)

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
            finish({ ok: true, message: '个性录音播放完成。' })
          })
          audio.onError(() => {
            if (requestGeneration !== generation) return
            finish({
              ok: false,
              message: '个性录音无法播放，已尝试回退文字朗读。',
              reason: 'playback'
            })
          })
          audio.src = audioSource
          audio.play()
        } catch (error) {
          finish({
            ok: false,
            message: '无法启动个性录音播放。',
            reason: 'playback'
          })
        }
      })
    },

    stop
  }
}
