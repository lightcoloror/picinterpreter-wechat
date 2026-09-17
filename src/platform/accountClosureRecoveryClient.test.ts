import { expect, test, vi } from 'vitest'
import { createMiniClosureRecoveryClient } from './accountClosureRecoveryClient'
import { createAccountClosureFileStorage } from './accountClosureStorage'

function fixture() {
  let session: any = { token: 'synthetic', user: { id: 'owner' } }
  const disk = new Map<string, string>()
  const storage = createAccountClosureFileStorage({ root: '/test',
    read: p => disk.get(p) ?? null, write: (p, s) => { disk.set(p, s) },
    rename: (a, b) => { disk.set(b, disk.get(a)!); disk.delete(a) } })
  const port: any = {
    previewAccountClosure: async () => ({ ok: true, value: { familyIds: ['family'], canConfirm: true, blockers: [] } }),
    prepareAccountClosure: async () => ({ ok: true, value: { receiptId: 'owner', secret: 'a'.repeat(64), expiresAt: 1 } }),
    confirmAccountClosure: vi.fn(async () => ({ ok: true, value: { operationId: 'op', accountDeleted: false, cleanupStatus: 'pending' } })),
    getAccountClosureStatus: async () => ({ ok: false, code: 'UNAVAILABLE', status: 503 })
  }
  const buildArchives = vi.fn(async () => [
    { id: 'legacy', label: '本机资料', kind: 'legacy' as const, bytes: new Uint8Array([1, 2, 3]) },
    { id: 'care:family:patient', label: '患者资料', kind: 'care' as const, bytes: new Uint8Array([4, 5, 6]) }
  ])
  const download = vi.fn(async () => {})
  const encrypt = vi.fn(async (bytes: Uint8Array, _password: string) => bytes)
  const create = () => createMiniClosureRecoveryClient({ port, scope: 'test', storage,
    getSession: () => session, buildArchives, download, encrypt })
  return { create, port, buildArchives, download, encrypt, setSession: (s: any) => { session = s } }
}

test('saved existing archive bytes remain exportable after logout and failed remote status', async () => {
  const h = fixture(); const client = h.create()
  await client.confirm(await client.preview())
  h.setSession(null)
  const restarted = h.create()
  await expect(restarted.status()).rejects.toMatchObject({ status: 503 })
  expect(await restarted.recoveries()).toHaveLength(2)
  await restarted.downloadRecovery('legacy', 'synthetic-password')
  expect(h.encrypt).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'synthetic-password')
  expect(h.download).toHaveBeenCalledWith('tuyujia-local-device-data.zip', new Uint8Array([1, 2, 3]))
  expect(h.port.confirmAccountClosure).toHaveBeenCalledTimes(1)
})

test('account switch isolates recovery listing and interrupts in-flight export', async () => {
  const h = fixture(); const client = h.create()
  await client.confirm(await client.preview())
  h.encrypt.mockImplementationOnce(async bytes => {
    h.setSession({ token: 'other-token', user: { id: 'other' } }); return bytes
  })
  await expect(client.downloadRecovery('legacy', 'password')).rejects.toThrow('账号已切换')
  expect(h.download).not.toHaveBeenCalled()
  expect(await client.recoveries()).toEqual([])
})

test('archive failure prevents confirmation and never fabricates a recovery list', async () => {
  const h = fixture(); const client = h.create()
  h.buildArchives.mockRejectedValueOnce(new Error('media unavailable'))
  await expect(client.confirm(await client.preview())).rejects.toMatchObject({ code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' })
  expect(h.port.confirmAccountClosure).not.toHaveBeenCalled()
  expect(await client.recoveries()).toEqual([])
})
