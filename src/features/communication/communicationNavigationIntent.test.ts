import { describe, expect, it } from 'vitest'

import { createCommunicationNavigationIntentStore } from './communicationNavigationIntent'

function createHarness(initialValue?: unknown) {
  const values = new Map<string, unknown>()
  if (initialValue !== undefined) {
    values.set('picinterpreter.communication.navigation-intent.v1', initialValue)
  }
  const store = createCommunicationNavigationIntentStore({
    getStorageSync: key => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key)
  })
  return { store, values }
}

describe('communicationNavigationIntent', () => {
  it('returns a valid intent once and removes it from storage', () => {
    const { store, values } = createHarness()

    expect(store.save({ utilityView: 'emergency' })).toBe(true)
    expect(store.take()).toEqual({ utilityView: 'emergency' })
    expect(store.take()).toBeNull()
    expect(values.size).toBe(0)
  })

  it('preserves the caregiver-tools request', () => {
    const { store } = createHarness()

    store.save({ showCaregiverTools: true })

    expect(store.take()).toEqual({ showCaregiverTools: true })
  })

  it('preserves a matching diagnostics deep link', () => {
    const { store } = createHarness()

    expect(store.save({ utilityView: 'diagnostics' })).toBe(true)
    expect(store.take()).toEqual({ utilityView: 'diagnostics' })
  })

  it('returns a saved phrase reuse request once', () => {
    const { store } = createHarness()

    expect(store.save({ reuseSavedPhraseId: ' phrase-1 ' })).toBe(true)
    expect(store.take()).toEqual({ reuseSavedPhraseId: 'phrase-1' })
    expect(store.take()).toBeNull()
  })

  it('preserves only normalized tile references for one expression draft', () => {
    const { store } = createHarness()

    expect(store.save({
      expressionDraft: [
        { id: ' water ', boardId: ' drinks ' },
        { id: '', boardId: 'ignored' }
      ]
    })).toBe(true)
    expect(store.take()).toEqual({
      expressionDraft: [{ id: 'water', boardId: 'drinks' }]
    })
  })

  it('rejects stale or malformed values', () => {
    const { store, values } = createHarness({
      utilityView: 'unknown',
      showCaregiverTools: false
    })

    expect(store.take()).toBeNull()
    expect(values.size).toBe(0)
    expect(store.save({})).toBe(false)
  })
})
