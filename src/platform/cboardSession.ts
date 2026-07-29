import {
  normalizeMaskedMainlandChinaPhone
} from '@cboard-communication-core/accountPhone'
import {
  normalizeCboardSubscriptionSummary,
  type CboardAccountSession
} from './cboardAccountPort'

export const CBOARD_AUTH_TOKEN_STORAGE_KEY = 'cboard_auth_token'
export const CBOARD_ACCOUNT_SESSION_STORAGE_KEY = 'cboard_account_session'

export interface CboardSessionStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: string): void
  removeStorageSync(key: string): void
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

function parseStoredValue(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function removeSessionKeys(storage: CboardSessionStorage) {
  for (const key of [
    CBOARD_ACCOUNT_SESSION_STORAGE_KEY,
    CBOARD_AUTH_TOKEN_STORAGE_KEY
  ]) {
    try {
      storage.removeStorageSync(key)
    } catch (error) {
      // Each key is removed independently so one storage failure cannot leak the other.
    }
  }
}

export function normalizeCboardAccountSession(
  value: unknown
): CboardAccountSession | null {
  const parsed = parseStoredValue(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const raw = parsed as Record<string, unknown>
  const token = normalizeText(raw.token, 4096)
  if (!token) return null

  const rawUser =
    raw.user && typeof raw.user === 'object' && !Array.isArray(raw.user)
      ? raw.user as Record<string, unknown>
      : {}
  const phoneMasked = normalizeMaskedMainlandChinaPhone(rawUser.phoneMasked)
  const subscription = normalizeCboardSubscriptionSummary(raw.subscription)

  return {
    token,
    user: {
      id: normalizeText(rawUser.id, 128),
      name: normalizeText(rawUser.name, 80),
      email: normalizeText(rawUser.email, 254).toLocaleLowerCase(),
      ...(phoneMasked ? { phoneMasked } : {})
    },
    ...(subscription ? { subscription } : {})
  }
}

export function createCboardSessionStore(storage: CboardSessionStorage) {
  return {
    load(): CboardAccountSession | null {
      try {
        const session = normalizeCboardAccountSession(
          storage.getStorageSync(CBOARD_ACCOUNT_SESSION_STORAGE_KEY)
        )
        if (session) return session

        const legacyToken = normalizeText(
          storage.getStorageSync(CBOARD_AUTH_TOKEN_STORAGE_KEY),
          4096
        )
        return legacyToken
          ? { token: legacyToken, user: { id: '', name: '', email: '' } }
          : null
      } catch (error) {
        return null
      }
    },

    save(value: CboardAccountSession): CboardAccountSession | null {
      const session = normalizeCboardAccountSession(value)
      if (!session) return null

      try {
        storage.setStorageSync(
          CBOARD_ACCOUNT_SESSION_STORAGE_KEY,
          JSON.stringify(session)
        )
        storage.setStorageSync(CBOARD_AUTH_TOKEN_STORAGE_KEY, session.token)
        return session
      } catch (error) {
        removeSessionKeys(storage)
        return null
      }
    },

    clear() {
      removeSessionKeys(storage)
    },

    getAuthToken() {
      const session = this.load()
      return session ? session.token : ''
    }
  }
}
