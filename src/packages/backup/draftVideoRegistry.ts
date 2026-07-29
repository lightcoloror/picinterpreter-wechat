export interface DraftVideoTransition {
  video: string
  discard: string[]
}

function normalizePath(value: string) {
  return String(value || '').trim()
}

export function createDraftVideoRegistry() {
  let original = ''
  let current = ''
  let owned = new Set<string>()

  const transition = (discard: string[] = []): DraftVideoTransition => ({
    video: current,
    discard: Array.from(new Set(discard.filter(Boolean)))
  })

  return {
    begin(video: string) {
      const discard = [...owned]
      original = normalizePath(video)
      current = original
      owned = new Set()
      return transition(discard)
    },
    replace(video: string) {
      const next = normalizePath(video)
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
    commit(video: string) {
      const retained = normalizePath(video)
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
