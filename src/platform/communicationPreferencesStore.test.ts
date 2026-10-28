import { describe, expect, test } from 'vitest'

import {
  COMMUNICATION_PREFERENCES_STORAGE_KEY,
  createCommunicationPreferencesStore
} from './communicationPreferencesStore'

describe('communication preferences storage', () => {
  test.each(['false', 'silent', 'readback', 'receipt'])('rejects %s save failure and verifies retry', mode => {
    const values = new Map<string, unknown>()
    let fail = ''
    const store = createCommunicationPreferencesStore({
      getStorageSync: key => {
        if (fail === 'readback') { fail = ''; throw new Error('read') }
        return values.get(key)
      },
      setStorageSync: (key, value) => {
        if (fail === 'false') { fail = ''; return false }
        if (fail === 'silent') { fail = ''; return }
        values.set(key, value)
        if (fail === 'receipt') { fail = ''; throw new Error('receipt') }
      }
    })
    store.update({ fontSize: 'large' })
    const next = { ...store.load(), fontSize: 'extra-large' as const }
    fail = mode
    expect(() => store.save(next)).toThrow()
    expect(store.save(next).fontSize).toBe('extra-large')
    expect(store.load().fontSize).toBe('extra-large')
  })
  test('recovers invalid storage and persists normalized updates', () => {
    const values = new Map<string, unknown>([
      [COMMUNICATION_PREFERENCES_STORAGE_KEY, '{broken']
    ])
    const store = createCommunicationPreferencesStore({
      getStorageSync: key => values.get(key),
      setStorageSync: (key, value) => values.set(key, value)
    })

    expect(store.load()).toEqual(expect.objectContaining({
      highContrast: false,
      gridColumns: 3,
      candidateAutoplayDelaySeconds: 15,
      onlinePictogramSearchEnabled: true
    }))
    expect(
      store.update({
        highContrast: true,
        speechRate: 0.2,
        candidateAutoplayDelaySeconds: 0,
        onlinePictogramSearchEnabled: false
      })
    ).toEqual(
      expect.objectContaining({
        highContrast: true,
        speechRate: 0.5,
        candidateAutoplayDelaySeconds: 0,
        onlinePictogramSearchEnabled: false
      })
    )
    expect(JSON.parse(String(values.get(COMMUNICATION_PREFERENCES_STORAGE_KEY))))
      .toEqual(expect.objectContaining({ highContrast: true }))
  })
})
