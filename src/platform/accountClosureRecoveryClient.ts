import { createAccountClosureRecovery } from '@cboard-communication-core/accountClosureRecovery'
import type { ClosureStorage } from '@cboard-communication-core/accountClosure'
import { createMiniAccountClosure } from './accountClosure'

export interface ClosureRecoveryEntry { id: string; label: string; kind: 'legacy' | 'care' }
type Options = Parameters<typeof createMiniAccountClosure>[0]

/** Archive builders use the existing ZIP formats, never include credentials or grants. */
export function createMiniClosureRecoveryClient(options: Omit<Options, 'preserveLocal'> & {
  storage: ClosureStorage
  buildArchives(input: { owner: string; familyIds: string[] }): Promise<Array<ClosureRecoveryEntry & { bytes: Uint8Array }>>
  encrypt(bytes: Uint8Array, password: string): Promise<Uint8Array>
  download(fileName: string, bytes: Uint8Array): Promise<void>
}) {
  const account = () => {
    const session = options.getSession()
    return session?.token ? session.user.id : null
  }
  const indexKey = (owner: string) => `closure-recovery-index-v1:${encodeURIComponent(options.scope)}:${owner}`
  const recovery = (id: string, bytes?: Uint8Array) => createAccountClosureRecovery({
    storage: options.storage, scope: `${options.scope}:${id}`, currentAccount: account,
    buildArchive: async () => { if (!bytes) throw new Error('恢复文件不存在'); return bytes }
  })
  const client = createMiniAccountClosure({ ...options, async preserveLocal(input) {
    const archives = await options.buildArchives(input)
    if (new Set(archives.map(a => a.id)).size !== archives.length) throw new Error('恢复列表不完整')
    const entries: ClosureRecoveryEntry[] = []
    for (const archive of archives) {
      await recovery(archive.id, archive.bytes).preserve({ owner: input.owner })
      entries.push({ id: archive.id, label: archive.label, kind: archive.kind })
    }
    await options.storage.set(indexKey(input.owner), entries)
    if (JSON.stringify(await options.storage.get(indexKey(input.owner))) !== JSON.stringify(entries)) throw new Error('恢复列表保存失败')
    return { saved: true }
  } })
  async function context() {
    const receipt = await client.receipt()
    if (!receipt) return null
    const entries: ClosureRecoveryEntry[] = await options.storage.get(indexKey(receipt.owner)) || []
    // Do not reveal an old account's recovery list if identity changed during I/O.
    const current = await client.receipt()
    if (current?.owner !== receipt.owner) throw new Error('账号已切换')
    return { owner: receipt.owner, entries }
  }
  return { ...client,
    isCurrentAccount: (owner: string) => account() === owner,
    async recoveries() { return (await context())?.entries || [] },
    async downloadRecovery(id: string, password: string) {
      const selected = await context()
      const entry = selected?.entries.find(item => item.id === id)
      if (!selected || !entry) throw new Error('未找到本机恢复文件')
      const bytes = await recovery(id).load(selected.owner)
      const encrypted = await options.encrypt(bytes, password)
      if ((await context())?.owner !== selected.owner) throw new Error('账号已切换')
      await options.download(entry.kind === 'care' ? 'tuyujia-device.zip' : 'tuyujia-local-device-data.zip', encrypted)
    }
  }
}
