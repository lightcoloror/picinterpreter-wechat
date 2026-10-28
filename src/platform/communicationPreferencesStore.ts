import type { CommunicationPreferences } from '@cboard-communication-core/communicationPreferences'
import {
  normalizeCommunicationPreferences,
  updateCommunicationPreferences
} from '@cboard-communication-core/communicationPreferences'

export const COMMUNICATION_PREFERENCES_STORAGE_KEY =
  'cboard_communication_preferences'

interface PreferencesStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: string): unknown
}

export function createCommunicationPreferencesStore(storage: PreferencesStorage) {
  const load = (): CommunicationPreferences => {
    const raw = storage.getStorageSync(COMMUNICATION_PREFERENCES_STORAGE_KEY)
    if (!raw) return normalizeCommunicationPreferences(null)
    try {
      return normalizeCommunicationPreferences(
        typeof raw === 'string' ? JSON.parse(raw) : raw
      )
    } catch (error) {
      return normalizeCommunicationPreferences(null)
    }
  }

  const save = (value: CommunicationPreferences) => {
    const normalized = normalizeCommunicationPreferences(value)
    const serialized = JSON.stringify(normalized)
    const result = storage.setStorageSync(
      COMMUNICATION_PREFERENCES_STORAGE_KEY,
      serialized
    )
    if (result === false) throw new Error('设置未保存到本机，请保留修改并重试。')
    if (storage.getStorageSync(COMMUNICATION_PREFERENCES_STORAGE_KEY) !== serialized) {
      throw new Error('无法核对本机设置，请保留修改并重试。')
    }
    return normalized
  }

  return {
    load,
    save,
    update(changes: Partial<CommunicationPreferences>) {
      return save(updateCommunicationPreferences(load(), changes))
    }
  }
}
