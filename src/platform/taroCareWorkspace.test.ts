import { expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  const values = new Map<string, unknown>()
  const context = { accountId: 'synthetic-account', familyId: 'synthetic-family', profileId: 'synthetic-patient' }
  const resources: Record<string, any> = { 'board:b': { kind: 'board', id: 'b', value: { tileIds: ['a'] } } }
  const engine = { init: vi.fn(), sync: vi.fn(), view: () => ({ locked: true, resources }), edit: vi.fn() }
  return { values, context, engine, modal: vi.fn(), queue: vi.fn(), scoped: (key: string) => `scope:${key}` }
})
vi.mock('@tarojs/taro', () => ({ default: {
  showModal: h.modal,
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

test('quota pause survives automatic refresh and clears only after a successful manual retry', async () => {
  h.values.clear()
  h.engine.sync.mockReset()
  h.modal.mockClear()
  const error = { status: 413, data: { code: 'FAMILY_MEDIA_QUOTA_EXCEEDED' } }
  h.engine.sync.mockRejectedValueOnce(error).mockResolvedValue(undefined)
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await expect(synchronizeCareWorkspace({ automatic: true })).rejects.toBe(error)
  expect(h.values.get(h.scoped('care-media-quota-paused'))).toBe(true)
  expect(h.modal).toHaveBeenCalledTimes(1)
  await synchronizeCareWorkspace({ automatic: true })
  expect(h.engine.sync).toHaveBeenLastCalledWith({ skipMediaUploads: true })
  expect(h.values.get(h.scoped('care-media-quota-paused'))).toBe(true)
  expect(h.modal).toHaveBeenCalledTimes(1)
  await synchronizeCareWorkspace()
  expect(h.engine.sync).toHaveBeenLastCalledWith({ skipMediaUploads: false })
  expect(h.values.has(h.scoped('care-media-quota-paused'))).toBe(false)
})

test('shared phrases use only the current scope and disappear when access is locked or no profile is selected', async () => {
  h.values.clear()
  const { loadCareSharedPhrases } = await import('./taroCareWorkspace')
  const shared = [{ id: 'family-shared:test', careSharedReadOnly: true }]
  h.values.set('other-family:care-shared-favorites', [{ id: 'unrelated' }])
  expect(loadCareSharedPhrases()).toEqual([])
  h.values.set(h.scoped('care-shared-favorites'), shared)
  expect(loadCareSharedPhrases()).toEqual(shared)
  h.values.set(h.scoped('care-locked'), true)
  expect(loadCareSharedPhrases()).toEqual([])
  h.values.set(h.scoped('care-locked'), false)
  const profileId = h.context.profileId
  try {
    h.context.profileId = ''
    expect(loadCareSharedPhrases()).toEqual([])
  } finally {
    h.context.profileId = profileId
    h.values.clear()
  }
})

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

test('offline restored profiles persist local changes without calling cloud synchronization', async () => {
  h.values.clear()
  h.engine.sync.mockClear()
  h.queue.mockClear()
  h.context.accountId = 'offline'
  h.values.set(h.scoped('care-pending-boards'), JSON.stringify([{ id: 'offline-board' }]))
  try {
    const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
    await synchronizeCareWorkspace()
    expect(h.queue).toHaveBeenCalled()
    expect(h.values.has(h.scoped('care-pending-boards'))).toBe(false)
    expect(h.engine.sync).not.toHaveBeenCalled()
  } finally {
    h.context.accountId = 'synthetic-account'
  }
})

test('closure local-only flush persists logged-in drafts without a cloud call', async () => {
  h.values.clear()
  h.engine.sync.mockClear()
  h.queue.mockClear()
  h.context.accountId = 'synthetic-account'
  h.values.set(h.scoped('care-pending-boards'), JSON.stringify([{ id: 'closure-board' }]))
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await synchronizeCareWorkspace({ localOnly: true })
  expect(h.queue).toHaveBeenCalled()
  expect(h.values.has(h.scoped('care-pending-boards'))).toBe(false)
  expect(h.engine.sync).not.toHaveBeenCalled()
})

test('persisted favorite baseline skips read-only usage changes and preserves unseen remote favorites', async () => {
  h.values.clear()
  h.engine.edit.mockClear()
  h.engine.edit.mockImplementation(async () => undefined)
  const before = { id: 'shared', sentence: '原收藏', createdAt: 1, output: [] }
  const resources = h.engine.view().resources
  resources['personalFavorite:shared'] = { kind: 'personalFavorite', id: 'shared', value: { sentence: '原收藏' } }
  resources['personalFavorite:remote'] = { kind: 'personalFavorite', id: 'remote', value: { sentence: '远端后来新增' } }
  h.values.set(h.scoped('care-pending-favorites'), JSON.stringify({
    base: [before],
    items: [{ ...before, usageCount: 1, lastUsedAt: 4, updatedAt: 4 },
      { id: 'new', sentence: '新收藏', output: [], createdAt: 2 }]
  }))
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await synchronizeCareWorkspace()
  expect(h.engine.edit).toHaveBeenCalledTimes(1)
  expect(h.engine.edit).toHaveBeenCalledWith('personalFavorite', 'new', expect.objectContaining({ sentence: '新收藏' }))
  expect(h.values.has(h.scoped('care-pending-favorites'))).toBe(false)
})
