import { describe, expect, it } from 'vitest'

import { createDraftImageRegistry } from './draftImageRegistry'

describe('draft image registry', () => {
  it('keeps the original while a processed candidate is reviewed', () => {
    const registry = createDraftImageRegistry()

    registry.replace('wxfile://original.jpg')

    expect(registry.derive('wxfile://cleaned.png')).toEqual({
      image: 'wxfile://cleaned.png',
      original: 'wxfile://original.jpg',
      discard: []
    })
    expect(registry.restore()).toEqual({
      image: 'wxfile://original.jpg',
      original: '',
      discard: ['wxfile://cleaned.png']
    })
  })

  it('discards the original only after the processed candidate is committed', () => {
    const registry = createDraftImageRegistry()

    registry.replace('wxfile://original.jpg')
    registry.derive('wxfile://cleaned.png')

    expect(registry.commit('wxfile://cleaned.png')).toEqual({
      image: '',
      original: '',
      discard: ['wxfile://original.jpg']
    })
  })

  it('cleans every owned draft file when a new photo replaces it', () => {
    const registry = createDraftImageRegistry()

    registry.replace('wxfile://first.jpg')
    registry.derive('wxfile://first-cleaned.png')

    expect(registry.replace('wxfile://second.jpg')).toEqual({
      image: 'wxfile://second.jpg',
      original: '',
      discard: [
        'wxfile://first.jpg',
        'wxfile://first-cleaned.png'
      ]
    })
  })

  it('does not delete the retained image when an unprocessed draft is saved', () => {
    const registry = createDraftImageRegistry()

    registry.replace('wxfile://original.jpg')

    expect(registry.commit('wxfile://original.jpg').discard).toEqual([])
    expect(registry.discardAll().discard).toEqual([])
  })
})
