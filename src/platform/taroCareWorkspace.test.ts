import { expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  const values = new Map<string, unknown>()
  const context = { accountId: 'synthetic-account', familyId: 'synthetic-family', profileId: 'synthetic-patient' }
  const resources: Record<string, any> = { 'board:b': { kind: 'board', id: 'b', value: { tileIds: ['a'] } } }
  const engine = { init: vi.fn(), sync: vi.fn(), view: () => ({ locked: true, resources }), edit: vi.fn() }
  return { values, context, engine, queue: vi.fn(), scoped: (key: string) => `scope:${key}` }
})
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => h.values.get(key),
  setStorageSync: (key: string, value: unknown) => h.values.set(key, value),
  removeStorageSync: (key: string) => h.values.delete(key),
  eventCenter: { trigger: vi.fn() }
} }))
vi.mock('@cboard-communication-core/careSync', () => ({ createCareSync: () => h.engine }))
vi.mock('@cboard-communication-core/careProjection', () => ({ queueCareBoards: h.queue, projectCareBoards: vi.fn() }))
vi.mock('@cboard-communication-core/careMediaValues', () => ({ encodeCareMedia: async (value: unknown) => value, decodeCareMedia: vi.fn() }))
vi.mock('./taroCareContext', () => ({ currentCareContext: () => h.context, careScopedKey: h.scoped, withCareHydration: vi.fn() }))
vi.mock('./taroCareRuntime', () => ({ runtime: {} }))
vi.mock('./taroPictureLibraryStore', () => ({ taroPictureLibraryStore: {} }))
vi.mock('./taroCommunicationRepository', () => ({ createTaroCommunicationRepository: vi.fn() }))
vi.mock('./taroPictogramOrderingStore', () => ({ taroPictogramOrderingStore: {} }))
vi.mock('./communicationCloudSync', () => ({ configureCareCloudSync: vi.fn() }))
vi.mock('../config/runtimeCapabilities', () => ({ apiBaseUrlFor: vi.fn() }))

test('a save made while the previous change is being queued survives for the next synchronization', async () => {
  const put = (kind: string, value: unknown) => h.values.set(h.scoped(`care-pending-${kind}`), JSON.stringify(value))
  put('boards', [{ id: 'b', revision: 1 }])
  put('personalImagePreferences', { label: 'first' })
  put('ordering', { b: ['first'] })
  put('speechRate', 1)
  h.queue.mockImplementationOnce(async () => { put('boards', [{ id: 'b', revision: 2 }]) })
  h.engine.edit.mockImplementation(async (_kind: string, id: string) => {
    if (id === 'personalImagePreferences') put(id, { label: 'second' })
    if (id === 'b') put('ordering', { b: ['second'] })
    if (id === 'speechRate') put(id, 1.5)
  })
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await synchronizeCareWorkspace()
  expect(JSON.parse(String(h.values.get(h.scoped('care-pending-boards'))))[0].revision).toBe(2)
  expect(JSON.parse(String(h.values.get(h.scoped('care-pending-personalImagePreferences')))).label).toBe('second')
  expect(JSON.parse(String(h.values.get(h.scoped('care-pending-ordering')))).b).toEqual(['second'])
  expect(JSON.parse(String(h.values.get(h.scoped('care-pending-speechRate'))))).toBe(1.5)
  h.engine.edit.mockImplementation(async () => undefined)
  await synchronizeCareWorkspace()
  for (const name of ['boards', 'personalImagePreferences', 'ordering', 'speechRate']) expect(h.values.has(h.scoped(`care-pending-${name}`))).toBe(false)
})
