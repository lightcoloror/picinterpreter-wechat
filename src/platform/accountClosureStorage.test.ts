import { describe, expect, test } from 'vitest'
import { createAccountClosureRecovery } from '@cboard-communication-core/accountClosureRecovery'
import { createAccountClosureFileStorage } from './accountClosureStorage'

function harness() {
  const disk = new Map<string, string>()
  const files = {
    root: '/synthetic',
    read: (path: string) => disk.get(path) ?? null,
    write: (path: string, text: string) => { disk.set(path, text) },
    rename: (from: string, to: string) => {
      if (!disk.has(from)) throw new Error('missing temporary file')
      disk.set(to, disk.get(from)!); disk.delete(from)
    }
  }
  return { files, disk, create: () => createAccountClosureFileStorage(files) }
}
describe('closure file storage', () => {
  test('shared recovery validates bytes after restart and rejects corrupted content', async () => {
    const h = harness()
    const bytes = new Uint8Array([0, 255, 1, 128])
    let owner: string | null = 'owner'
    const create = () => createAccountClosureRecovery({ storage: h.create(), scope: 'test',
      currentAccount: () => owner, buildArchive: async () => bytes })
    await expect(create().preserve({ owner: 'owner' })).resolves.toEqual({ saved: true })
    owner = null
    expect(await create().load('owner')).toEqual(bytes)
    const path = [...h.disk.keys()][0]
    const envelope = JSON.parse(h.disk.get(path)!)
    envelope.value.bytes = 'AAAAAA=='
    h.disk.set(path, JSON.stringify(envelope))
    await expect(create().load('owner')).rejects.toMatchObject({ code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' })
  })
  test('persists receipt and arbitrary binary recovery bytes across adapter restart', async () => {
    const h = harness(); const first = h.create()
    const receipt = { owner: 'owner', secret: 'synthetic', submitted: true }
    const record = { owner: 'owner', version: 1, bytes: new Uint8Array([0, 255, 128, 1]) }
    await first.set('receipt', receipt); await first.set('archive', record)
    expect(await h.create().get('receipt')).toEqual(receipt)
    expect(await h.create().get('archive')).toEqual(record)
    expect(await h.create().get('other-owner')).toBeNull()
    expect([...h.disk.keys()].every(path => !path.endsWith('.tmp'))).toBe(true)
  })
  test('failed replacement leaves prior complete record and throws', async () => {
    const h = harness(); const store = h.create()
    await store.set('receipt', { submitted: false })
    h.files.rename = () => { throw new Error('quota exceeded') }
    await expect(store.set('receipt', { submitted: true })).rejects.toThrow('quota exceeded')
    expect(await store.get('receipt')).toEqual({ submitted: false })
  })
  test('read failure and malformed records never become absent records', async () => {
    const h = harness(); const store = h.create()
    await store.set('receipt', {})
    const path = [...h.disk.keys()][0]
    h.disk.set(path, '{')
    await expect(store.get('receipt')).rejects.toThrow()
    h.disk.set(path, JSON.stringify({ version: 2, kind: 'json', value: {} }))
    await expect(store.get('receipt')).rejects.toThrow()
    h.files.read = () => { throw new Error('permission denied') }
    await expect(store.get('receipt')).rejects.toThrow('permission denied')
  })
})
