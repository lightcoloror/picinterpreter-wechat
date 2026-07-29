export interface DraftImageTransition {
  image: string
  original: string
  discard: string[]
}

function normalizedPath(value: string) {
  return String(value || '').trim()
}

export function createDraftImageRegistry() {
  let current = ''
  let original = ''
  let owned = new Set<string>()

  const transition = (discard: string[] = []): DraftImageTransition => ({
    image: current,
    original,
    discard: Array.from(new Set(discard.filter(Boolean)))
  })

  return {
    replace(image: string) {
      const next = normalizedPath(image)
      const discard = [...owned].filter(path => path !== next)
      current = next
      original = ''
      owned = new Set(next ? [next] : [])
      return transition(discard)
    },

    derive(image: string) {
      const next = normalizedPath(image)
      if (!current || !next) return transition()

      const source = original || current
      const discard =
        original && current !== original && current !== next
          ? [current]
          : []
      discard.forEach(path => owned.delete(path))
      original = source
      current = next
      owned.add(source)
      owned.add(next)
      return transition(discard)
    },

    restore() {
      if (!original) return transition()
      const processed = current
      current = original
      original = ''
      if (processed !== current) owned.delete(processed)
      return transition(processed !== current ? [processed] : [])
    },

    commit(image: string) {
      const retained = normalizedPath(image)
      const discard = [...owned].filter(path => path !== retained)
      current = ''
      original = ''
      owned.clear()
      return transition(discard)
    },

    discardAll() {
      const discard = [...owned]
      current = ''
      original = ''
      owned.clear()
      return transition(discard)
    }
  }
}
