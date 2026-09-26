import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  session: null as null | { user: { id: string } },
  trigger: vi.fn()
}))

vi.mock('@tarojs/taro', () => ({
  default: {
    env: { USER_DATA_PATH: '' },
    getStorageSync: (key: string) => h.values.get(key),
    setStorageSync: (key: string, value: unknown) => h.values.set(key, value),
    removeStorageSync: (key: string) => h.values.delete(key),
    eventCenter: { trigger: h.trigger }
  }
}))

vi.mock('./taroCboardAccountPort', () => ({
  taroCboardSessionStore: { load: () => h.session }
}))

import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import {
  canEditCareLibrary,
  careScopedKey,
  withCareHydration
} from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'
import { PICTURE_LIBRARY_STORAGE_KEY } from './pictureLibraryStore'

function setOnlineSelection(value: Record<string, unknown>) {
  h.session = { user: { id: 'account-1' } }
  h.values.set('care-selection-v1:account-1', {
    id: 'profile-1',
    familyId: 'family-1',
    relationship: { role: 'patient', defaultMode: 'expression' },
    ...value
  })
}

describe('Care-scoped picture library permissions', () => {
  beforeEach(() => {
    vi.stubEnv('TARO_APP_CARE_COLLABORATION', 'true')
    h.values.clear()
    h.session = null
    h.trigger.mockClear()
  })

  test.each([undefined, [], ['read']])(
    'unknown/read-only permissions %j reject before storage and pending writes',
    permissions => {
      setOnlineSelection(permissions === undefined ? {} : { permissions })

      expect(canEditCareLibrary()).toBe(false)
      expect(() => taroPictureLibraryStore.save(DEFAULT_BOARD_FIXTURES)).toThrow(
        '当前档案未授予图库编辑权限'
      )
      expect(h.values.has(careScopedKey(PICTURE_LIBRARY_STORAGE_KEY))).toBe(false)
      expect(h.values.has(careScopedKey('care-pending-boards'))).toBe(false)
      expect(h.trigger).not.toHaveBeenCalled()
    }
  )

  test('an online library editor can save and queue changes for this profile only', () => {
    setOnlineSelection({ permissions: ['read', 'library.edit'] })

    expect(canEditCareLibrary()).toBe(true)
    expect(() => taroPictureLibraryStore.save(DEFAULT_BOARD_FIXTURES)).not.toThrow()
    expect(h.values.has(careScopedKey(PICTURE_LIBRARY_STORAGE_KEY))).toBe(true)
    expect(h.values.has(careScopedKey('care-pending-boards'))).toBe(true)
    expect(h.values.has('communication-v2:another:family:profile:care-pending-boards')).toBe(false)
  })

  test('locked online profiles reject even when the edit grant was previously cached', () => {
    setOnlineSelection({ permissions: ['library.edit'], locked: true })

    expect(canEditCareLibrary()).toBe(false)
    expect(() => taroPictureLibraryStore.save(DEFAULT_BOARD_FIXTURES)).toThrow(
      '当前档案未授予图库编辑权限'
    )
    expect(h.values.has(careScopedKey(PICTURE_LIBRARY_STORAGE_KEY))).toBe(false)
    expect(h.values.has(careScopedKey('care-pending-boards'))).toBe(false)
  })

  test('hydration can project the server library without generating a pending edit', () => {
    setOnlineSelection({ permissions: [] })

    expect(() => withCareHydration(() =>
      taroPictureLibraryStore.save(DEFAULT_BOARD_FIXTURES)
    )).not.toThrow()
    expect(h.values.has(careScopedKey(PICTURE_LIBRARY_STORAGE_KEY))).toBe(true)
    expect(h.values.has(careScopedKey('care-pending-boards'))).toBe(false)
  })

  test('guest and explicit offline contexts retain local library editing', () => {
    expect(canEditCareLibrary()).toBe(true)
    expect(() => taroPictureLibraryStore.save(DEFAULT_BOARD_FIXTURES)).not.toThrow()
    expect(h.values.has(PICTURE_LIBRARY_STORAGE_KEY)).toBe(true)

    h.values.clear()
    h.values.set('care-offline-selection-v1', {
      id: 'offline-profile', familyId: 'offline-family'
    })
    expect(canEditCareLibrary()).toBe(true)
    expect(() => taroPictureLibraryStore.save(DEFAULT_BOARD_FIXTURES)).not.toThrow()
    expect(h.values.has(careScopedKey(PICTURE_LIBRARY_STORAGE_KEY))).toBe(true)
  })
})
