import { beforeEach, expect, test, vi } from 'vitest'
import { createTaroCommunicationRepository } from './taroCommunicationRepository'
import { careScopedKey, withCareHydration } from './taroCareContext'

const h = vi.hoisted(() => ({ values: new Map<string, unknown>(), trigger: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => h.values.get(key),
  setStorageSync: (key: string, value: unknown) => h.values.set(key, value),
  removeStorageSync: (key: string) => h.values.delete(key),
  eventCenter: { trigger: h.trigger }
} }))
vi.mock('./taroCboardAccountPort', () => ({ taroCboardSessionStore: {
  load: () => ({ user: { id: 'account' } })
} }))

const shared = { id: 'shared', sentence: '共享收藏', output: [], createdAt: 1 }
const pending = () => h.values.get(careScopedKey('care-pending-favorites'))
beforeEach(() => {
  vi.stubEnv('TARO_APP_CARE_COLLABORATION', 'true')
  h.values.clear()
  h.trigger.mockClear()
  h.values.set('care-selection-v1:account', { id: 'patient', familyId: 'family' })
})

test('history and favorite usage stay local while explicit edits retain their original baseline', () => {
  const repository = createTaroCommunicationRepository()
  expect(h.trigger).not.toHaveBeenCalled()
  withCareHydration(() => repository.overwriteCommunicationSavedPhrases([shared]))
  expect(pending()).toBeUndefined()
  const original = repository.loadCommunicationSavedPhrases()
  repository.overwriteCommunicationHistory([])
  repository.overwriteCommunicationSavedPhrases(original.map(item => ({
    ...item, usageCount: 1, lastUsedAt: 2, updatedAt: 2
  })))
  expect(pending()).toBeUndefined()
  expect(h.trigger).not.toHaveBeenCalled()

  repository.overwriteCommunicationSavedPhrases([
    ...repository.loadCommunicationSavedPhrases(),
    { ...shared, id: 'new', sentence: '新增收藏' }
  ])
  const first = JSON.parse(String(pending()))
  expect(first.base.map((item: any) => item.id)).toEqual(['shared'])
  expect(first.items.map((item: any) => item.id)).toContain('new')

  // Recreate the repository as after restart; pending baseline lives on disk.
  const restarted = createTaroCommunicationRepository()
  restarted.overwriteCommunicationSavedPhrases(restarted.loadCommunicationSavedPhrases()
    .map(item => item.id === 'new' ? { ...item, sentence: '继续修改' } : item))
  const second = JSON.parse(String(pending()))
  expect(second.base).toEqual(first.base)
  expect(second.items.find((item: any) => item.id === 'new').sentence).toBe('继续修改')
})

test('nested cloud projection does not become a user edit when repository initialization ends', () => {
  withCareHydration(() => {
    const repository = createTaroCommunicationRepository()
    repository.overwriteCommunicationSavedPhrases([shared])
  })
  expect(h.trigger).not.toHaveBeenCalled()
  expect(pending()).toBeUndefined()
  const repository = createTaroCommunicationRepository()
  repository.overwriteCommunicationSavedPhrases([])
  const packet = JSON.parse(String(pending()))
  expect(packet.items).toEqual([])
  expect(packet.base[0].id).toBe('shared')
})

test.each([undefined, [], ['read']])('readonly or unknown care grants reject personal image preferences before local persistence (%s)', permissions => {
  h.values.set('care-selection-v1:account', { id: 'patient', familyId: 'family', permissions })
  const repository = createTaroCommunicationRepository()
  const key = careScopedKey('cboard_communication_personal_image_preferences')
  const originalValue = h.values.get(key)
  expect(() => repository.savePersonalImagePreference({
    tileId: 'tile', boardId: 'board', labelSnapshot: '熟悉物品', image: '/tmp/image.jpg'
  } as any)).toThrow('当前档案未授予熟悉图片偏好编辑权限')
  expect(h.values.get(key)).toBe(originalValue)
  expect(h.values.has(careScopedKey('care-pending-personalImagePreferences'))).toBe(false)
})

test('preferences.edit allows personal image preference persistence and pending sync', () => {
  h.values.set('care-selection-v1:account', {
    id: 'patient', familyId: 'family', permissions: ['read', 'preferences.edit']
  })
  const repository = createTaroCommunicationRepository()
  expect(repository.savePersonalImagePreference({
    tileId: 'tile', boardId: 'board', labelSnapshot: '熟悉物品', image: '/tmp/image.jpg'
  } as any)).toMatchObject({ tileId: 'tile', boardId: 'board' })
  expect(h.values.has(careScopedKey('cboard_communication_personal_image_preferences'))).toBe(true)
  expect(h.values.has(careScopedKey('care-pending-personalImagePreferences'))).toBe(true)
})

test('cloud hydration can project personal image preferences without creating a pending edit', () => {
  const repository = createTaroCommunicationRepository()
  withCareHydration(() => repository.savePersonalImagePreference({
    tileId: 'tile', boardId: 'board', labelSnapshot: '熟悉物品', image: '/tmp/image.jpg'
  } as any))
  expect(h.values.has(careScopedKey('cboard_communication_personal_image_preferences'))).toBe(true)
  expect(h.values.has(careScopedKey('care-pending-personalImagePreferences'))).toBe(false)
})
