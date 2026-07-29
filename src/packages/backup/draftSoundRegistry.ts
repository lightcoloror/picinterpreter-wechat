export interface DraftSoundTransition {
  sound: string
  discard: string[]
}

function normalizePath(value: string) {
  return String(value || '').trim()
}

export function createDraftSoundRegistry() {
  let original = ''
  let current = ''
  let owned = new Set<string>()

  const transition = (discard: string[] = []): DraftSoundTransition => ({
    sound: current,
    discard: Array.from(new Set(discard.filter(Boolean)))
  })

  return {
    begin(sound: string) {
      const discard = [...owned]
      original = normalizePath(sound)
      current = original
      owned = new Set()
      return transition(discard)
    },

    replace(sound: string) {
      const next = normalizePath(sound)
      const discard = [...owned].filter(path => path !== next)
      current = next
      owned = new Set(next ? [next] : [])
      return transition(discard)
    },

    clear() {
      const discard = [...owned]
      current = ''
      owned.clear()
      return transition(discard)
    },

    commit(sound: string) {
      const retained = normalizePath(sound)
      const discard = [
        ...[...owned].filter(path => path !== retained),
        ...(original && original !== retained ? [original] : [])
      ]
      original = ''
      current = ''
      owned.clear()
      return transition(discard)
    },

    discardAll() {
      const discard = [...owned]
      original = ''
      current = ''
      owned.clear()
      return transition(discard)
    }
  }
}
