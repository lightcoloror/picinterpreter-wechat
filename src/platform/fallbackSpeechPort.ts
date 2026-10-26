import type { SpeechOptions, SpeechPort, SpeechResult } from './speechPort'

const NO_FALLBACK_REASONS = new Set<SpeechResult['reason']>([
  'invalid',
  'stopped'
])

export function createFallbackSpeechPort(
  primary: SpeechPort,
  fallback: SpeechPort
): SpeechPort {
  let generation = 0
  let settleActive: ((result: SpeechResult) => void) | null = null
  const stopped = (): SpeechResult => ({
    ok: false, message: '朗读已停止。', reason: 'stopped'
  })
  const stop = () => {
    generation += 1
    const settle = settleActive
    settleActive = null
    // Stop both existing adapters even if one device throws during cleanup.
    for (const provider of [primary, fallback]) {
      try {
        provider.stop()
      } catch (_) {
        // Still settle and stop the other provider.
      }
    }
    if (settle) settle(stopped())
  }
  const safeSpeak = async (
    provider: SpeechPort,
    text: string,
    options?: SpeechOptions
  ): Promise<SpeechResult> => {
    try {
      return await provider.speak(text, options)
    } catch (_) {
      return { ok: false, message: '语音服务暂时不可用，请重试。', reason: 'provider' }
    }
  }
  return {
    get available() {
      return primary.available || fallback.available
    },

    async speak(text, options) {
      stop()
      const requestGeneration = generation
      return new Promise<SpeechResult>(resolve => {
        settleActive = resolve
        const finish = (result: SpeechResult) => {
          if (requestGeneration !== generation) return
          settleActive = null
          resolve(result)
        }
        void (async () => {
          const primaryResult = await safeSpeak(primary, text, options)
          // The underlying promise can already be resolved when stop runs.
          // Check again before creating a potentially paid fallback request.
          if (requestGeneration !== generation) return
          if (
            primaryResult.ok ||
            NO_FALLBACK_REASONS.has(primaryResult.reason) ||
            !fallback.available
          ) {
            finish(primaryResult)
            return
          }
          const fallbackResult = await safeSpeak(fallback, text, options)
          if (requestGeneration !== generation) return
          finish(fallbackResult.ok
            ? { ok: true, message: '微信语音暂不可用，已通过 cboard-api 完成朗读。' }
            : { ...fallbackResult, message: primaryResult.message + '；' + fallbackResult.message })
        })()
      })
    },
    stop
  }
}
