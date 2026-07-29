import { describe, expect, test } from 'vitest'

import { createDraftSoundRegistry } from './draftSoundRegistry'

describe('draft sound registry', () => {
  test('keeps an existing recording when editing is cancelled', () => {
    const registry = createDraftSoundRegistry()

    registry.begin('wxfile://saved/original.mp3')
    registry.replace('wxfile://saved/candidate.mp3')

    expect(registry.discardAll()).toEqual({
      sound: '',
      discard: ['wxfile://saved/candidate.mp3']
    })
  })

  test('removes the prior recording only after a replacement is committed', () => {
    const registry = createDraftSoundRegistry()

    registry.begin('wxfile://saved/original.mp3')
    registry.replace('wxfile://saved/first.mp3')
    expect(
      registry.replace('wxfile://saved/second.mp3')
    ).toEqual({
      sound: 'wxfile://saved/second.mp3',
      discard: ['wxfile://saved/first.mp3']
    })
    expect(
      registry.commit('wxfile://saved/second.mp3')
    ).toEqual({
      sound: '',
      discard: ['wxfile://saved/original.mp3']
    })
  })

  test('committing a clear removes the saved original recording', () => {
    const registry = createDraftSoundRegistry()

    registry.begin('wxfile://saved/original.mp3')
    expect(registry.clear()).toEqual({ sound: '', discard: [] })
    expect(registry.commit('')).toEqual({
      sound: '',
      discard: ['wxfile://saved/original.mp3']
    })
  })
})
