import { createVerifiedScopedLocalStorage, type ScopedDependencies } from './verifiedScopedLocalStorage'

export const FAVORITE_LOCAL_KEYS = [
  'cboard_communication_favorite_state_v1', 'cboard_communication_saved_phrases',
  'cboard_communication_saved_phrase_tombstones', 'cboard_tuyujia_saved_phrases', 'care-pending-favorites'
] as const
export const isFavoriteLocalFileName = (name: string) =>
  /^picinterpreter-favorite-local-([a-f0-9]{64}|cleared-v1)\.json(?:\.tmp)?$/.test(name)
export function createFavoriteLocalFileStorage(dependencies: Omit<ScopedDependencies, 'definition'>) {
  return createVerifiedScopedLocalStorage({ ...dependencies, definition: {
    prefix: 'picinterpreter-favorite-local-', keys: FAVORITE_LOCAL_KEYS,
    normalizeValue(key, value) {
      if (value === null || value === undefined || value === '') return null
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      const parsed = JSON.parse(text)
      if (key === FAVORITE_LOCAL_KEYS[0] ? !parsed || parsed.version !== 1 || !Array.isArray(parsed.phrases) || !Array.isArray(parsed.tombstones)
        : key === FAVORITE_LOCAL_KEYS[4] ? !parsed || typeof parsed !== 'object' : !Array.isArray(parsed)) {
        throw new Error('常用语或删除记录不可读取，原文件已保留。')
      }
      return text
    }
  } })
}
