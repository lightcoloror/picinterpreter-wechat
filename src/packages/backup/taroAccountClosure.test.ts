import { beforeEach, expect, test, vi } from 'vitest'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

const h = vi.hoisted(() => ({ disk: new Map<string, string>(),
  session: { token: 'synthetic', user: { id: 'owner' } } as any,
  context: { accountId: 'owner', profileId: 'patient', familyId: 'family' } as any,
  confirm: vi.fn(), flush: vi.fn(), exportCare: vi.fn(), share: vi.fn(), encrypt: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: { env: { USER_DATA_PATH: '/test' }, getFileSystemManager: () => ({
  readFileSync: (p: string) => { if (!h.disk.has(p)) throw { errMsg: 'no such file' }; return h.disk.get(p) },
  writeFileSync: (p: string, s: string) => { h.disk.set(p, s) },
  renameSync: (a: string, b: string) => { h.disk.set(b, h.disk.get(a)!); h.disk.delete(a) }
}) } }))
vi.mock('../../platform/taroCboardAccountPort', () => ({ taroCboardSessionStore: { load: () => h.session }, taroCboardAccountPort: {
  previewAccountClosure: async () => ({ ok: true, value: { familyIds: ['family'], blockers: [], canConfirm: true } }),
  prepareAccountClosure: async () => ({ ok: true, value: { receiptId: 'owner', secret: 'a'.repeat(64) } }),
  confirmAccountClosure: h.confirm,
  getAccountClosureStatus: async () => ({ ok: false, status: 503 })
} }))
vi.mock('../../config/runtimeCapabilities', () => ({ apiBaseUrlFor: () => 'https://synthetic.example.test' }))
vi.mock('../../platform/taroCareContext', () => ({ currentCareContext: () => h.context }))
vi.mock('../../platform/taroCareWorkspace', () => ({ synchronizeCareWorkspace: h.flush }))
vi.mock('../../platform/taroCareRuntime', () => ({ runtime: { request: async () => [
  { id: 'patient', familyId: 'family' }, { id: 'other', familyId: 'unrelated' }
] } }))
vi.mock('@cboard-communication-core/careDeviceArchive', () => ({ exportCareDeviceArchive: h.exportCare }))
vi.mock('../../platform/taroPrivateArchiveEncryption', () => ({ encryptPrivateArchiveData: h.encrypt }))
vi.mock('../../platform/taroPictureLibraryArchivePort', () => ({ taroPictureLibraryArchivePort: { shareArchive: h.share } }))
import { createTaroAccountClosure } from './taroAccountClosure'

const cache = (key: string, value: any) => h.disk.set(`/test/care-${bytesToHex(sha256(key))}.json`, JSON.stringify(value))
beforeEach(() => {
  h.disk.clear(); vi.clearAllMocks()
  h.session = { token: 'synthetic', user: { id: 'owner' } }
  h.context = { accountId: 'owner', profileId: 'patient', familyId: 'family' }
  h.confirm.mockResolvedValue({ ok: true, value: { operationId: 'op', cleanupStatus: 'pending', accountDeleted: false } })
  h.exportCare.mockResolvedValue(new Uint8Array([4, 5]))
  h.encrypt.mockImplementation(async bytes => bytes)
  h.share.mockResolvedValue({ ok: true })
})
test('Taro adapter preserves owned cached archives and exports after logout', async () => {
  cache('care-v1:owner:family:patient', { locked: false, resources: {} })
  cache('care-v1:owner:unrelated:other', { locked: false, resources: {} })
  const client = createTaroAccountClosure(async () => new Uint8Array([1, 2]))
  await client.confirm(await client.preview())
  expect(h.flush).toHaveBeenCalledWith({ localOnly: true })
  expect(h.exportCare).toHaveBeenCalledTimes(1)
  expect(h.exportCare.mock.calls[0][0]).toEqual({ familyId: 'family', profileId: 'patient' })
  h.session = null
  expect(await client.recoveries()).toHaveLength(2)
  await client.downloadRecovery('legacy', 'synthetic-password')
  expect(h.share).toHaveBeenCalledWith('tuyujia-local-device-data.zip', new Uint8Array([1, 2]))
})
test('current unrelated family is never copied into the legacy recovery archive', async () => {
  h.context.familyId = 'unrelated'; h.context.profileId = 'other'
  const build = vi.fn(async () => new Uint8Array([1]))
  const client = createTaroAccountClosure(build)
  await client.confirm(await client.preview())
  expect(build).not.toHaveBeenCalled()
  expect(h.flush).not.toHaveBeenCalled()
  expect(await client.recoveries()).toEqual([])
})
test('corrupt cached patient data blocks cloud confirmation', async () => {
  h.disk.set(`/test/care-${bytesToHex(sha256('care-v1:owner:family:patient'))}.json`, '{')
  const client = createTaroAccountClosure(async () => new Uint8Array([1]))
  await expect(client.confirm(await client.preview())).rejects.toMatchObject({ code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' })
  expect(h.confirm).not.toHaveBeenCalled()
})
