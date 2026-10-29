import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ values: new Map<string, unknown>(), write: vi.fn(), remove: vi.fn(), files: { readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn(), readdirSync: vi.fn() } }))
vi.mock('@tarojs/taro', () => ({ default: { env: { USER_DATA_PATH: '/synthetic' }, getFileSystemManager: () => h.files,
  getStorageSync: (key: string) => h.values.get(key), setStorageSync: h.write, removeStorageSync: h.remove } }))
vi.mock('./taroCboardAccountPort', () => ({ taroCboardSessionStore: { load: () => null } }))
import { COMMUNICATION_STORAGE_KEYS } from '@cboard-communication-core/repository'
import { createTaroCommunicationRepository } from './taroCommunicationRepository'
beforeEach(() => { vi.stubEnv('TARO_APP_CARE_COLLABORATION', 'false'); vi.clearAllMocks(); h.values.clear() })
test('future schema blocks actual Taro repository before verified files can migrate on read', () => {
  h.values.set(COMMUNICATION_STORAGE_KEYS.schema, JSON.stringify({ schemaVersion: 999 }))
  h.values.set(COMMUNICATION_STORAGE_KEYS.history, JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ id: `synthetic-${i}` }))))
  const before = [...h.values]
  const repository = createTaroCommunicationRepository()
  for (const read of [repository.loadCommunicationIdentity, repository.loadReceiverRecords, repository.loadExpressionDraft, repository.loadSavedPhrasePreparation, repository.loadCommunicationSavedPhrases]) {
    expect(read).toThrow('请使用更新版本打开')
  }
  expect(h.write).not.toHaveBeenCalled(); expect(h.remove).not.toHaveBeenCalled()
  for (const method of Object.values(h.files)) expect(method).not.toHaveBeenCalled()
  expect([...h.values]).toEqual(before)
})
