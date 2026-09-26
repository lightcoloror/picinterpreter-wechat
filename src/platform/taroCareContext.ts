import Taro from '@tarojs/taro'
import { taroCboardSessionStore } from './taroCboardAccountPort'

export interface CareSelection {
  id: string
  familyId: string
  name?: string
  relationship?: { role: string; defaultMode: string } | null
  permissions?: string[]
  locked?: boolean
}
export function currentCareContext() {
  if (process.env.TARO_APP_CARE_COLLABORATION !== 'true') return null
  const accountId = taroCboardSessionStore.load()?.user.id || (Taro.getStorageSync('care-offline-selection-v1') ? 'offline' : null)
  if (!accountId) return null
  const selected = Taro.getStorageSync(accountId === 'offline' ? 'care-offline-selection-v1' : `care-selection-v1:${accountId}`) as CareSelection | undefined
  return { accountId, familyId: selected?.familyId || '', profileId: selected?.id || '', selection: selected }
}
export function saveCareSelection(selection: CareSelection) {
  const accountId = taroCboardSessionStore.load()?.user.id
  if (!accountId) throw new Error('请先登录')
  Taro.setStorageSync(`care-selection-v1:${accountId}`, selection)
}
export function careScopedKey(key: string) {
  const c = currentCareContext()
  return c ? `communication-v2:${[c.accountId, c.familyId || 'unselected', c.profileId || 'unselected'].map(encodeURIComponent).join(':')}:${key}` : key
}
let hydrating = false
export function isCareHydrating() {
  return hydrating
}
export function canEditCareLibrary(context = currentCareContext()) {
  return hasCarePermission('library.edit', context)
}
export function canEditCarePreferences(context = currentCareContext()) {
  return hasCarePermission('preferences.edit', context)
}
function hasCarePermission(
  permission: string,
  context: NonNullable<ReturnType<typeof currentCareContext>> | null
) {
  if (!context || context.accountId === 'offline') return true
  if (!Array.isArray(context.selection?.permissions)) return false
  return context.selection.permissions.includes(permission) &&
    !context.selection.locked &&
    !Taro.getStorageSync(careScopedKey('care-locked'))
}
export function withCareHydration<T>(operation: () => T): T {
  const previous = hydrating
  hydrating = true
  try { return operation() } finally { hydrating = previous }
}
export function markCareLocalChange(kind: string, value: unknown) {
  const context = currentCareContext()
  if (!context?.profileId || hydrating) return
  Taro.setStorageSync(careScopedKey(`care-pending-${kind}`), JSON.stringify(value))
  Taro.eventCenter.trigger('care-local-change')
}
