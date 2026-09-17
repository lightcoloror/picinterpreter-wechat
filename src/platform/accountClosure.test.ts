import { describe, expect, test, vi } from 'vitest'
import { createMiniAccountClosure } from './accountClosure'

function harness() {
  let session: any = { token: 'synthetic-token', user: { id: 'owner' } }
  const rows = new Map<string, any>()
  const storage = {
    get: async (key: string) => structuredClone(rows.get(key)),
    set: async (key: string, value: any) => { rows.set(key, structuredClone(value)) }
  }
  const preview = { familyIds: ['family'], families: [], blockers: [], canConfirm: true,
    confirmationRequired: true, revalidationRequired: true, deletesCloudData: true, preservesLocalData: true }
  const port = {
    previewAccountClosure: vi.fn(async () => ({ ok: true, message: '', value: preview })),
    prepareAccountClosure: vi.fn(async () => ({ ok: true, message: '', value: { receiptId: 'owner', secret: 'a'.repeat(64), expiresAt: 123 } })),
    confirmAccountClosure: vi.fn(async (): Promise<any> => ({ ok: true, message: '', value: { operationId: 'operation', cleanupStatus: 'pending', accountDeleted: false } })),
    getAccountClosureStatus: vi.fn(async (): Promise<any> => ({ ok: true, message: '', value: { status: 'prepared', accountDeleted: false, expiresAt: 123 } }))
  }
  const preserveLocal = vi.fn(async () => ({ saved: true }))
  const create = () => createMiniAccountClosure({ port, storage, scope: 'https://synthetic.example.test', getSession: () => session, preserveLocal })
  return { create, port, preserveLocal, storage, setSession: (next: any) => { session = next } }
}

describe('mini account closure shared workflow adapter', () => {
  test('preserves local data before confirmation and reports accepted rather than deleted', async () => {
    const h = harness(); const client = h.create()
    const result = await client.confirm(await client.preview())
    expect(result).toMatchObject({ status: 'confirmed', accountDeleted: false, cleanupStatus: 'pending' })
    expect(h.preserveLocal).toHaveBeenCalledWith({ owner: 'owner', familyIds: ['family'] })
    expect(h.preserveLocal.mock.invocationCallOrder[0]).toBeLessThan(h.port.confirmAccountClosure.mock.invocationCallOrder[0])
    expect(h.port.confirmAccountClosure).toHaveBeenCalledWith('synthetic-token', { familyIds: ['family'], secret: 'a'.repeat(64), confirmCloudDeletion: true })
  })
  test('unknown response survives restart without a second submission or leaked transport secrets', async () => {
    const h = harness(); let client = h.create(); const preview = await client.preview()
    h.port.confirmAccountClosure.mockRejectedValueOnce(new Error('Bearer synthetic-token synthetic-secret'))
    await expect(client.confirm(preview)).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: '连接中断，请查询注销进度。' })
    client = h.create()
    expect(await client.status()).toMatchObject({ confirmationUnknown: true })
    await expect(client.confirm(await client.preview())).rejects.toMatchObject({ code: 'CLOSURE_CONFIRMATION_UNKNOWN' })
    expect(h.port.confirmAccountClosure).toHaveBeenCalledTimes(1)
    expect(h.port.prepareAccountClosure).toHaveBeenCalledTimes(1)
  })
  test('blocks submission on failed local preservation', async () => {
    const h = harness(); const client = h.create()
    h.preserveLocal.mockResolvedValueOnce({ saved: false })
    await expect(client.confirm(await client.preview())).rejects.toMatchObject({ code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' })
    expect(h.port.confirmAccountClosure).not.toHaveBeenCalled()
  })
  test('blocks stale preview after account switch and isolates other account receipts', async () => {
    const h = harness(); const client = h.create(); const preview = await client.preview()
    await client.confirm(preview)
    h.setSession({ token: 'second', user: { id: 'other' } })
    await expect(client.confirm(preview)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(await client.receipt()).toBeNull()
  })
  test('queries the saved receipt after logout without needing a bearer', async () => {
    const h = harness(); const client = h.create()
    await client.confirm(await client.preview())
    h.setSession(null)
    h.port.getAccountClosureStatus.mockResolvedValueOnce({ ok: true, value: { status: 'confirmed', accountDeleted: true, cleanupStatus: 'complete', expiresAt: 123 } })
    expect(await h.create().status()).toMatchObject({ accountDeleted: true, cleanupStatus: 'complete' })
    expect(h.port.getAccountClosureStatus).toHaveBeenCalledWith({ receiptId: 'owner', secret: 'a'.repeat(64) })
  })
  test('retains stable refusal code and status for the shared retry policy', async () => {
    const h = harness(); const client = h.create()
    h.port.confirmAccountClosure.mockResolvedValueOnce({ ok: false, code: 'FAMILY_TRANSFER_REQUIRED', status: 409 })
    await expect(client.confirm(await client.preview())).rejects.toMatchObject({ code: 'FAMILY_TRANSFER_REQUIRED', status: 409 })
    expect(await client.receipt()).toMatchObject({ submitted: false })
  })
})

