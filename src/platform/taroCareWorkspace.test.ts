import { expect, test, vi } from 'vitest'
import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from '@cboard-communication-core/repository'

const h = vi.hoisted(() => {
  const values = new Map<string, unknown>()
  const context = { accountId: 'synthetic-account', familyId: 'synthetic-family', profileId: 'synthetic-patient' }
  const resources: Record<string, any> = { 'board:b': { kind: 'board', id: 'b', value: { tileIds: ['a'] } } }
  const engine = { init: vi.fn(), sync: vi.fn(), view: vi.fn(() => ({ locked: true, permissions: [], resources })), edit: vi.fn(), archive: () => engine.view() }
  return { values, context, engine, favoriteStore: null as any, modal: vi.fn(), queue: vi.fn(), saveSelection: vi.fn(), scoped: (key: string) => `scope:${key}` }
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
vi.mock('./taroCareContext', () => ({ currentCareContext: () => h.context, careScopedKey: h.scoped, saveCareSelection: h.saveSelection, withCareHydration: vi.fn() }))
vi.mock('./taroCareRuntime', () => ({ runtime: { storage: { get: async () => JSON.stringify(h.engine.view()) } } }))
vi.mock('./taroFavoriteLocalFileStorage', () => ({ createTaroFavoriteStateStore: () => h.favoriteStore || ({
  read: () => ({ revision: 1, pending: h.values.has(h.scoped('care-pending-favorites')) ? JSON.parse(String(h.values.get(h.scoped('care-pending-favorites')))) : null }),
  commit: (_before: unknown, after: any) => { if (after.pending === null) h.values.delete(h.scoped('care-pending-favorites')) }
}) }))
vi.mock('./taroPictureLibraryStore', () => ({ taroPictureLibraryStore: {} }))
vi.mock('./taroCommunicationRepository', () => ({ createTaroCommunicationRepository: vi.fn() }))
vi.mock('./taroPictogramOrderingStore', () => ({ taroPictogramOrderingStore: {} }))
vi.mock('./communicationCloudSync', () => ({ configureCareCloudSync: vi.fn() }))
vi.mock('../config/runtimeCapabilities', () => ({ apiBaseUrlFor: vi.fn() }))

test('projection refreshes only the currently selected account/profile grant and lock state', async () => {
  h.values.clear()
  h.saveSelection.mockClear()
  h.engine.init.mockReset().mockResolvedValue(undefined)
  h.engine.sync.mockReset().mockResolvedValue(undefined)
  const selection = {
    id: h.context.profileId,
    familyId: h.context.familyId,
    name: '合成档案',
    relationship: { role: 'relative', defaultMode: 'receiver' },
    permissions: ['read', 'library.edit'],
    locked: false
  }
  Object.assign(h.context, { selection })

  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await synchronizeCareWorkspace({ localOnly: true })

  expect(h.saveSelection).toHaveBeenCalledWith({
    ...selection,
    permissions: [],
    locked: true
  })
  expect(h.saveSelection.mock.calls[0][0]).not.toHaveProperty('token')
})

test('quota notice state deduplicates automatic failures and clears after another view recovers the engine', async () => {
  h.values.clear()
  h.engine.sync.mockReset()
  h.modal.mockClear()
  const error = { status: 413, data: { code: 'FAMILY_MEDIA_QUOTA_EXCEEDED' } }
  h.engine.sync.mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValue(undefined)
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await expect(synchronizeCareWorkspace({ automatic: true })).rejects.toBe(error)
  expect(h.values.get(h.scoped('care-media-quota-paused'))).toBe(true)
  expect(h.modal).toHaveBeenCalledTimes(1)
  await expect(synchronizeCareWorkspace({ automatic: true })).rejects.toBe(error)
  expect(h.engine.sync).toHaveBeenLastCalledWith({ automatic: true })
  expect(h.values.get(h.scoped('care-media-quota-paused'))).toBe(true)
  expect(h.modal).toHaveBeenCalledTimes(1)
  // CarePanel has its own engine instance but shares this persisted core state.
  await h.engine.sync({ automatic: false })
  expect(h.values.get(h.scoped('care-media-quota-paused'))).toBe(true)
  await synchronizeCareWorkspace({ automatic: true })
  expect(h.engine.sync).toHaveBeenLastCalledWith({ automatic: true })
  expect(h.values.has(h.scoped('care-media-quota-paused'))).toBe(false)
  expect(h.modal).toHaveBeenCalledTimes(1)
})

test.each(['INVALID_MEDIA', 'INVALID_IMAGE', 'MEDIA_CHECKSUM_MISMATCH'])('notifies once for automatic %s and clears the notice after recovery', async code => {
  h.values.clear()
  h.modal.mockClear()
  h.engine.sync.mockReset()
  const error = { status: 400, data: { code } }
  h.engine.sync.mockRejectedValue(error)
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  await expect(synchronizeCareWorkspace({ automatic: true })).rejects.toBe(error)
  await expect(synchronizeCareWorkspace({ automatic: true })).rejects.toBe(error)
  expect(h.modal).toHaveBeenCalledTimes(1)
  expect(h.modal.mock.calls[0][0].content).toContain('本地图片仍保留')
  await expect(synchronizeCareWorkspace()).rejects.toBe(error)
  expect(h.modal).toHaveBeenCalledTimes(2)
  h.engine.sync.mockResolvedValue(undefined)
  await synchronizeCareWorkspace({ automatic: true })
  expect(h.values.has(h.scoped('care-media-invalid-notice'))).toBe(false)
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

test('cloud favorite projection keeps its same-scope local recording and honors remote deletion', async () => {
  h.values.clear()
  const { withCareHydration } = await import('./taroCareContext')
  const { projectCareBoards } = await import('@cboard-communication-core/careProjection')
  const { decodeCareMedia } = await import('@cboard-communication-core/careMediaValues')
  const { taroPictureLibraryStore } = await import('./taroPictureLibraryStore')
  const { taroPictogramOrderingStore } = await import('./taroPictogramOrderingStore')
  const { createTaroCommunicationRepository } = await import('./taroCommunicationRepository')
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  let saved: any[] = [{ id: 'recorded', output: [{ id: 'water', boardId: 'food', sound: 'wxfile://synthetic-recording.mp3' }] }]
  const overwrite = vi.fn((items: any[]) => { saved = items })
  Object.assign(taroPictureLibraryStore, { load: () => [], reset: vi.fn() })
  Object.assign(taroPictogramOrderingStore, { load: () => ({}), save: vi.fn() })
  vi.mocked(projectCareBoards).mockReturnValue([])
  vi.mocked(decodeCareMedia).mockImplementation(value => value)
  vi.mocked(withCareHydration).mockImplementation(work => work())
  vi.mocked(createTaroCommunicationRepository).mockReturnValue({
    loadCommunicationSavedPhrases: () => saved,
    overwriteCommunicationSavedPhrases: overwrite
  } as any)
  const snapshot: any = { locked: false, cursor: 1, permissions: ['read'], media: {}, resources: {
    'personalFavorite:recorded': { kind: 'personalFavorite', id: 'recorded', value: {
      sentence: '喝水', output: [{ id: 'water', boardId: 'food', label: '喝水' }]
    } }
  } }
  const previous = h.engine.view()
  h.engine.view.mockReturnValue(snapshot)
  try {
    await synchronizeCareWorkspace({ localOnly: true })
    expect(saved[0].output[0]).toEqual({ id: 'water', boardId: 'food', label: '喝水', sound: 'wxfile://synthetic-recording.mp3' })
    snapshot.resources['personalFavorite:recorded'].deleted = true
    await synchronizeCareWorkspace({ localOnly: true })
    expect(saved).toEqual([])
  } finally {
    h.engine.view.mockReturnValue(previous)
    vi.mocked(withCareHydration).mockReset()
  }
})

// Exercise the production care projection with the actual verified favorite
// repository. The existing sync engine/transport remains isolated and synthetic.
async function capacityProjection(count: number) {
  h.values.clear()
  h.engine.edit.mockReset().mockResolvedValue(undefined)
  const { withCareHydration } = await import('./taroCareContext')
  const { projectCareBoards } = await import('@cboard-communication-core/careProjection')
  const { decodeCareMedia } = await import('@cboard-communication-core/careMediaValues')
  const { taroPictureLibraryStore } = await import('./taroPictureLibraryStore')
  const { taroPictogramOrderingStore } = await import('./taroPictogramOrderingStore')
  const { createTaroCommunicationRepository } = await import('./taroCommunicationRepository')
  const { synchronizeCareWorkspace } = await import('./taroCareWorkspace')
  const phrases = Array.from({ length: count }, (_, index) => ({
    id: `synthetic-capacity-${index}`, sentence: `合成表达${index}`, createdAt: index + 1,
    output: [{ id: 'synthetic-shape', label: '几何图', personId: `synthetic-person-${index}`, image: '/synthetic.png' }]
  }))
  const data = new Map([[COMMUNICATION_STORAGE_KEYS.savedPhrases, JSON.stringify(phrases)]])
  const repository = createCommunicationRepository({ storage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }
  }, now: () => 1000 })
  h.favoriteStore = { read: () => repository.readFavoriteState(), commit: (before: any, changes: any) => repository.commitFavoriteState(before, changes) }
  Object.assign(taroPictureLibraryStore, { load: () => [], reset: vi.fn() })
  Object.assign(taroPictogramOrderingStore, { load: () => ({}), save: vi.fn() })
  vi.mocked(projectCareBoards).mockReturnValue([])
  vi.mocked(decodeCareMedia).mockImplementation(value => value)
  vi.mocked(withCareHydration).mockImplementation(work => work())
  vi.mocked(createTaroCommunicationRepository).mockReturnValue(repository)
  const previous = h.engine.view()
  const snapshot: any = { locked: false, cursor: 1, permissions: ['read'], media: {}, resources: {} }
  const project = (items: any[]) => {
    snapshot.resources = Object.fromEntries(items.map(item => [`personalFavorite:${item.id}`, {
      kind: 'personalFavorite', id: item.id, value: item
    }]))
  }
  const before = repository.loadCommunicationSavedPhrases()
  project(before)
  h.engine.view.mockReturnValue(snapshot)
  return { repository, before, project,
    run: (options = { localOnly: true }) => synchronizeCareWorkspace(options),
    restore: () => { h.favoriteStore = null; h.engine.view.mockReturnValue(previous); vi.mocked(withCareHydration).mockReset(); h.values.clear() }
  }
}

test.each([99, 100, 101])('care projection retains all %i existing phrases without truncating their identities', async count => {
  const f = await capacityProjection(count)
  try {
    await f.run()
    expect(f.repository.loadCommunicationSavedPhrases()).toEqual(f.before)
  } finally { f.restore() }
})

test('care projection rejects 99 plus 2 new phrases without replacing local state and can retry a fitting projection', async () => {
  const f = await capacityProjection(99)
  const extras = [99, 100].map(index => ({ id: `new-${index}`, sentence: `新增合成${index}`, output: [], createdAt: index + 1 }))
  try {
    const before = f.repository.readFavoriteState()
    f.project([...f.before, ...extras])
    await expect(f.run()).rejects.toMatchObject({ code: 'SAVED_PHRASE_CAPACITY' })
    expect(f.repository.readFavoriteState()).toEqual(before)
    f.project([...f.before, extras[0]])
    await f.run()
    const saved = f.repository.loadCommunicationSavedPhrases()
    expect(saved).toHaveLength(100)
    expect(saved.slice(0, 99)).toEqual(f.before)
  } finally { f.restore() }
})

test('care favorite handoff failure keeps the full pending packet and blocks a remote projection', async () => {
  const f = await capacityProjection(100)
  try {
    const state = f.repository.readFavoriteState()
    f.repository.commitFavoriteState(state, { pending: { base: [], items: f.before } })
    const before = f.repository.readFavoriteState()
    f.project([])
    h.engine.edit.mockRejectedValueOnce(new Error('synthetic handoff failure'))
    await expect(f.run()).rejects.toThrow('synthetic handoff failure')
    expect(f.repository.readFavoriteState()).toEqual(before)
  } finally { f.restore() }
})

test.each(['local', 'pending'])('care blocks 101-item %s data before queueing or network and keeps it for explicit retry', async source => {
  const f = await capacityProjection(source === 'local' ? 101 : 100)
  h.engine.sync.mockClear()
  h.engine.edit.mockClear()
  h.modal.mockClear()
  try {
    if (source === 'pending') f.repository.commitFavoriteState(f.repository.readFavoriteState(), {
      pending: { base: [], items: [...f.before, { id: 'pending-extra', sentence: '合成第101句', output: [], createdAt: 101 }] }
    })
    const before = f.repository.readFavoriteState()
    f.project([])
    await expect(f.run({ localOnly: false })).rejects.toMatchObject({ code: 'SAVED_PHRASE_CAPACITY' })
    expect(f.repository.readFavoriteState()).toEqual(before)
    expect(h.engine.sync).not.toHaveBeenCalled()
    expect(h.engine.edit).not.toHaveBeenCalled()
    expect(h.modal).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('容量上限') }))
  } finally { f.restore() }
})
