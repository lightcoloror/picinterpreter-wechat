import Taro from '@tarojs/taro'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { exportCareDeviceArchive } from '@cboard-communication-core/careDeviceArchive'
import { createAccountClosureFileStorage } from '../../platform/accountClosureStorage'
import { createMiniClosureRecoveryClient, type ClosureRecoveryEntry } from '../../platform/accountClosureRecoveryClient'
import { taroCboardAccountPort, taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import { apiBaseUrlFor } from '../../config/runtimeCapabilities'
import { runtime } from '../../platform/taroCareRuntime'
import { currentCareContext } from '../../platform/taroCareContext'
import { synchronizeCareWorkspace } from '../../platform/taroCareWorkspace'
import { encryptPrivateArchiveData } from '../../platform/taroPrivateArchiveEncryption'
import { taroPictureLibraryArchivePort } from '../../platform/taroPictureLibraryArchivePort'

let storage: ReturnType<typeof createAccountClosureFileStorage> | null = null
function readText(path: string): string | null {
  try { return String(Taro.getFileSystemManager().readFileSync(path, 'utf8')) }
  catch (error: any) {
    const message = String(error?.errMsg || error?.message || '').toLowerCase()
    if (message.includes('no such file') || message.includes('not exist')) return null
    throw error
  }
}
const readCare = (key: string) => readText(`${Taro.env.USER_DATA_PATH}/care-${bytesToHex(sha256(key))}.json`)
function closureStorage() {
  if (storage) return storage
  const root = String(Taro.env.USER_DATA_PATH || '')
  if (!root) throw new Error('本机文件目录不可用')
  const fs = Taro.getFileSystemManager()
  storage = createAccountClosureFileStorage({ root,
    read: readText,
    write: (path, text) => fs.writeFileSync(path, text, 'utf8'),
    rename: (from, to) => fs.renameSync(from, to)
  })
  return storage
}

export function createTaroAccountClosure(buildLocalArchive: () => Promise<Uint8Array>) {
  return createMiniClosureRecoveryClient({
    port: taroCboardAccountPort, storage: closureStorage(),
    scope: apiBaseUrlFor('cloudFeatures') || 'unconfigured',
    getSession: () => taroCboardSessionStore.load(),
    async buildArchives({ owner, familyIds }) {
      const before = currentCareContext()
      const check = () => {
        const now = currentCareContext()
        if (taroCboardSessionStore.load()?.user.id !== owner ||
          now?.profileId !== before?.profileId || now?.familyId !== before?.familyId) {
          throw Object.assign(new Error('账号或患者档案已切换'), { code: 'ACCOUNT_CHANGED' })
        }
      }
      check()
      const mayExportCurrent = !before?.profileId || familyIds.includes(before.familyId)
      if (mayExportCurrent) await synchronizeCareWorkspace({ localOnly: true })
      check()
      const archives: Array<ClosureRecoveryEntry & { bytes: Uint8Array }> = []
      const activeRaw = before?.profileId
        ? readCare(`care-v1:${owner}:${before.familyId}:${before.profileId}`) : null
      const activeLocked = activeRaw ? JSON.parse(activeRaw).locked : false
      if (mayExportCurrent && !activeLocked) archives.push(
        { id: 'legacy', label: '本机图板与沟通资料', kind: 'legacy', bytes: await buildLocalArchive() }
      )
      check()
      // The cache filenames are hashed; reuse the existing profile catalogue to locate them.
      const cached = readCare(`care-list-v1:${owner}`)
      const profiles = await runtime.request('/care/profiles', 'GET')
      if (!Array.isArray(profiles)) throw new Error('无法核对患者档案列表')
      const all = [...profiles, ...(cached ? JSON.parse(cached).profiles || [] : [])]
      if (before?.selection) all.push(before.selection)
      const seen = new Set<string>()
      for (const profile of all) {
        if (!profile?.id || !familyIds.includes(profile.familyId)) continue
        const id = `care:${profile.familyId}:${profile.id}`
        if (seen.has(id)) continue
        seen.add(id)
        if (seen.size > 512) throw new Error('本机档案过多，请先分别导出')
        const raw = readCare(`care-v1:${owner}:${profile.familyId}:${profile.id}`)
        if (!raw) continue
        const snapshot = JSON.parse(raw)
        if (snapshot.locked) continue
        archives.push({ id, label: `患者档案恢复副本 ${archives.length}`, kind: 'care',
          bytes: await exportCareDeviceArchive({ familyId: profile.familyId, profileId: profile.id }, snapshot) })
        check()
      }
      check()
      return archives
    },
    encrypt: encryptPrivateArchiveData,
    async download(fileName, bytes) {
      const result = await taroPictureLibraryArchivePort.shareArchive(fileName, bytes)
      if (!result.ok) throw new Error(result.message)
    }
  })
}
