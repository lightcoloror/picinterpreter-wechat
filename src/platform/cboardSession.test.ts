import { describe, expect, test, vi } from 'vitest'

import {
  CBOARD_ACCOUNT_SESSION_STORAGE_KEY,
  CBOARD_AUTH_TOKEN_STORAGE_KEY,
  createCboardSessionStore
} from './cboardSession'

function createHarness(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const storage = {
    getStorageSync: vi.fn((key: string) => values.get(key)),
    setStorageSync: vi.fn((key: string, value: string) => values.set(key, value)),
    removeStorageSync: vi.fn((key: string) => values.delete(key))
  }
  return { values, storage, store: createCboardSessionStore(storage) }
}

describe('cboardSessionStore', () => {
  test('persists only the normalized session and compatibility token', () => {
    const harness = createHarness()
    const saved = harness.store.save({
      token: ' token ',
      user: {
        id: 'user-1',
        name: '照护者',
        email: 'CARE@EXAMPLE.TEST',
        phoneMasked: '138****8000'
      },
      settings: { shouldNotPersist: true },
      subscription: {
        id: 'subscriber-1',
        status: 'ACTIVE',
        expiryDate: '2026-08-01T00:00:00.000Z',
        product: {
          title: '家庭支持方案',
          billingPeriod: 'P1M',
          price: { currencyCode: 'CNY', units: 12 }
        }
      }
    })

    expect(saved?.user.email).toBe('care@example.test')
    expect(saved?.user.phoneMasked).toBe('138****8000')
    expect(harness.values.get(CBOARD_AUTH_TOKEN_STORAGE_KEY)).toBe('token')
    expect(String(harness.values.get(CBOARD_ACCOUNT_SESSION_STORAGE_KEY)))
      .not.toContain('shouldNotPersist')
    expect(String(harness.values.get(CBOARD_ACCOUNT_SESSION_STORAGE_KEY)))
      .not.toContain('13800138000')
    expect(saved?.subscription?.status).toBe('active')
    expect(String(harness.values.get(CBOARD_ACCOUNT_SESSION_STORAGE_KEY)))
      .toContain('家庭支持方案')
  })

  test('loads a legacy token without losing existing login compatibility', () => {
    const harness = createHarness({
      [CBOARD_AUTH_TOKEN_STORAGE_KEY]: 'legacy-token'
    })

    expect(harness.store.load()).toEqual({
      token: 'legacy-token',
      user: { id: '', name: '', email: '' }
    })
  })

  test('rolls back both account keys when persistence fails halfway', () => {
    const harness = createHarness()
    harness.storage.setStorageSync.mockImplementation((key, value) => {
      if (key === CBOARD_AUTH_TOKEN_STORAGE_KEY) {
        throw new Error('storage full')
      }
      harness.values.set(key, value)
    })

    const saved = harness.store.save({
      token: 'token',
      user: { id: 'user-1', name: '照护者', email: 'care@example.test' }
    })

    expect(saved).toBeNull()
    expect(harness.values.has(CBOARD_ACCOUNT_SESSION_STORAGE_KEY)).toBe(false)
    expect(harness.values.has(CBOARD_AUTH_TOKEN_STORAGE_KEY)).toBe(false)
  })

  test('logout removes account keys without touching communication data', () => {
    const harness = createHarness({
      [CBOARD_ACCOUNT_SESSION_STORAGE_KEY]: '{}',
      [CBOARD_AUTH_TOKEN_STORAGE_KEY]: 'token',
      cboard_tuyujia_history: '[{"id":"history-1"}]'
    })

    harness.store.clear()

    expect(harness.values.has(CBOARD_ACCOUNT_SESSION_STORAGE_KEY)).toBe(false)
    expect(harness.values.has(CBOARD_AUTH_TOKEN_STORAGE_KEY)).toBe(false)
    expect(harness.values.has('cboard_tuyujia_history')).toBe(true)
  })

  test('logout removes the compatibility token even if session removal fails', () => {
    const harness = createHarness({
      [CBOARD_ACCOUNT_SESSION_STORAGE_KEY]: '{"token":"token"}',
      [CBOARD_AUTH_TOKEN_STORAGE_KEY]: 'token'
    })
    harness.storage.removeStorageSync.mockImplementation(key => {
      if (key === CBOARD_ACCOUNT_SESSION_STORAGE_KEY) {
        throw new Error('session key is locked')
      }
      harness.values.delete(key)
    })

    expect(() => harness.store.clear()).not.toThrow()
    expect(harness.values.has(CBOARD_AUTH_TOKEN_STORAGE_KEY)).toBe(false)
  })
})
