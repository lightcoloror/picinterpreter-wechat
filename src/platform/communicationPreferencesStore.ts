import type { CommunicationPreferences } from '@cboard-communication-core/communicationPreferences'
import {
  normalizeCommunicationPreferences,
  updateCommunicationPreferences
} from '@cboard-communication-core/communicationPreferences'

export const COMMUNICATION_PREFERENCES_STORAGE_KEY =
  'cboard_communication_preferences'

interface PreferencesStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: string): void
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
    storage.setStorageSync(
      COMMUNICATION_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized)
    )
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
