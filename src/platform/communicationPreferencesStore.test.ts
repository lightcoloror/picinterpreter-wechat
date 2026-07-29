import { describe, expect, test } from 'vitest'

import {
  COMMUNICATION_PREFERENCES_STORAGE_KEY,
  createCommunicationPreferencesStore
} from './communicationPreferencesStore'

describe('communication preferences storage', () => {
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
