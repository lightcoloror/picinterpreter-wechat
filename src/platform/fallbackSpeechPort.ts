import type { SpeechPort, SpeechResult } from './speechPort'

const NO_FALLBACK_REASONS = new Set<SpeechResult['reason']>([
  'invalid',
  'stopped'
])

export function createFallbackSpeechPort(
  primary: SpeechPort,
  fallback: SpeechPort
): SpeechPort {
  return {
    get available() {
      return primary.available || fallback.available
    },

    async speak(text, options) {
      const primaryResult = await primary.speak(text, options)
      if (
        primaryResult.ok ||
        NO_FALLBACK_REASONS.has(primaryResult.reason) ||
        !fallback.available
      ) {
        return primaryResult
      }

      const fallbackResult = await fallback.speak(text, options)
      if (fallbackResult.ok) {
        return {
          ok: true,
          message: '微信语音暂不可用，已通过 cboard-api 完成朗读。'
        }
      }

      return {
        ...fallbackResult,
        message: primaryResult.message + '；' + fallbackResult.message
      }
    },

    stop() {
      primary.stop()
      fallback.stop()
    }
  }
}
