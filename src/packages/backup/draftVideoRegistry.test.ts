import { describe, expect, test } from 'vitest'

import { createDraftVideoRegistry } from './draftVideoRegistry'

describe('draft video registry', () => {
  test('keeps an existing video when metadata editing is cancelled', () => {
    const registry = createDraftVideoRegistry()

    registry.begin('wxfile://saved/original.mp4')

    expect(registry.discardAll()).toEqual({ video: '', discard: [] })
  })

  test('discards replaced drafts and retains the committed video', () => {
    const registry = createDraftVideoRegistry()

    registry.replace('wxfile://saved/first.mp4')
    expect(registry.replace('wxfile://saved/second.mp4')).toEqual({
      video: 'wxfile://saved/second.mp4',
      discard: ['wxfile://saved/first.mp4']
    })
    expect(registry.commit('wxfile://saved/second.mp4')).toEqual({
      video: '',
      discard: []
    })
  })
})
