import type { SpeechPort } from './speechPort'

export function createPreferredSpeechPort(
  delegate: SpeechPort,
  loadSpeechVoice: () => string
): SpeechPort {
  return {
    get available() {
      return delegate.available
    },

    speak(text, options = {}) {
      const voice = String(options.voice || loadSpeechVoice() || '').trim()
      return delegate.speak(text, {
        ...options,
        ...(voice ? { voice } : {})
      })
    },

    stop() {
      delegate.stop()
    }
  }
}
