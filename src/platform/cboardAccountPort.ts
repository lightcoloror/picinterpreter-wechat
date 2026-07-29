import type {
  CommunicationHistoryEntry,
  CommunicationSavedPhraseEntry,
  CommunicationSavedPhraseTombstone
} from '@cboard-communication-core/repository'
import {
  buildConfirmedReceiverSyncPayload
} from '@cboard-communication-core/receiverSync'
import {
  buildCommunicationSavedPhraseSyncPayload,
  normalizeSavedPhraseTombstones
} from '@cboard-communication-core/savedPhraseSync'
import {
  isValidMainlandChinaPhone,
  normalizeMainlandChinaPhone,
  normalizeMaskedMainlandChinaPhone
} from '@cboard-communication-core/accountPhone'

export interface CboardApiResult<T> {
  ok: boolean
  message: string
  value?: T
}

export interface CboardAccountUser {
  id: string
  name: string
  email: string
  phoneMasked?: string
}

export interface CboardSubscriptionSummary {
  id: string
  status: string
  expiryDate?: string
  product?: {
    title: string
    billingPeriod: string
    price: string | {
      currencyCode?: string
      units?: number | string
      nanos?: number
    }
  }
}

export interface CboardAccountSession {
  token: string
  user: CboardAccountUser
  settings?: Record<string, unknown>
  subscription?: CboardSubscriptionSummary
}

export interface CboardRegistrationResult {
  requiresActivation: true
}

export interface CboardPhoneVerificationConfiguration {
  available: boolean
  phoneLoginAvailable: boolean
  phonePasswordResetAvailable: boolean
  requiredForPhoneRegistration: boolean
  challengeExpiresInSeconds: number
  verificationExpiresInSeconds: number
  resendAfterSeconds: number
  codeLength: 6
}

export type CboardPhoneVerificationPurpose =
  | 'registration'
  | 'login'
  | 'password-reset'

export interface CboardPhoneVerificationChallenge {
  challengeId: string
  phoneMasked: string
  expiresInSeconds: number
  resendAfterSeconds: number
}

export interface CboardPhoneVerificationConfirmation {
  verificationToken: string
  expiresInSeconds: number
}

export interface CboardPasswordResetResult {
  requested: true
}

export interface CboardPhonePasswordResetResult {
  reset: true
}

export interface CboardAccountDeleteValue {
  accountId: string
}

export interface ConfirmedReceiverSyncValue {
  acceptedCount: number
  conflictCount: number
  conflictedRecordIds: string[]
  records: CommunicationHistoryEntry[]
  deletedRecordIds: string[]
  deletedRecords: ConfirmedReceiverTombstone[]
}

export interface ConfirmedReceiverDeleteValue {
  deletedCount: number
  deletedRecordIds: string[]
  deletedRecords: ConfirmedReceiverTombstone[]
}

export interface ConfirmedReceiverTombstone {
  id: string
  deletedAt: number
  deletedBy: string
  serverVersion: number
}

export interface SavedPhraseSyncValue {
  acceptedCount: number
  conflictCount: number
  conflictedPhraseIds: string[]
  phrases: CommunicationSavedPhraseEntry[]
  deletedPhraseIds: string[]
  deletedPhrases: CommunicationSavedPhraseTombstone[]
}

export interface SavedPhraseDeleteValue {
  deletedCount: number
  deletedPhraseIds: string[]
  deletedPhrases: CommunicationSavedPhraseTombstone[]
}

export interface CboardAccountPort {
  readonly configured: boolean
  login(input: {
    email: string
    password: string
  }): Promise<CboardApiResult<CboardAccountSession>>
  loginWithPhone(input: {
    phone: string
    phoneVerificationToken: string
  }): Promise<CboardApiResult<CboardAccountSession>>
  getPhoneVerificationConfiguration(): Promise<
    CboardApiResult<CboardPhoneVerificationConfiguration>
  >
  requestPhoneVerification(input: {
    phone: string
    purpose?: CboardPhoneVerificationPurpose
  }): Promise<CboardApiResult<CboardPhoneVerificationChallenge>>
  confirmPhoneVerification(input: {
    challengeId: string
    phone: string
    code: string
    purpose?: CboardPhoneVerificationPurpose
  }): Promise<CboardApiResult<CboardPhoneVerificationConfirmation>>
  register(input: {
    name: string
    email: string
    phone: string
    password: string
    phoneVerificationToken?: string
  }): Promise<CboardApiResult<CboardRegistrationResult>>
  requestPasswordReset(input: {
    email: string
  }): Promise<CboardApiResult<CboardPasswordResetResult>>
  resetPasswordWithPhone(input: {
    phone: string
    phoneVerificationToken: string
    password: string
  }): Promise<CboardApiResult<CboardPhonePasswordResetResult>>
  deleteAccount(
    token: string,
    userId: string
  ): Promise<CboardApiResult<CboardAccountDeleteValue>>
  getSettings(
    token: string
  ): Promise<CboardApiResult<Record<string, unknown>>>
  updateSettings(
    token: string,
    patch: Record<string, unknown>
  ): Promise<CboardApiResult<Record<string, unknown>>>
  syncConfirmedReceiverRecords(
    token: string,
    records: CommunicationHistoryEntry[]
  ): Promise<CboardApiResult<ConfirmedReceiverSyncValue>>
  deleteConfirmedReceiverRecords(
    token: string,
    recordIds: string[],
    options?: { deleteAll?: boolean }
  ): Promise<CboardApiResult<ConfirmedReceiverDeleteValue>>
  syncCommunicationSavedPhrases(
    token: string,
    phrases: CommunicationSavedPhraseEntry[]
  ): Promise<CboardApiResult<SavedPhraseSyncValue>>
  deleteCommunicationSavedPhrases(
    token: string,
    phraseIds: string[],
    options?: { deleteAll?: boolean }
  ): Promise<CboardApiResult<SavedPhraseDeleteValue>>
}

interface RequestResult {
  statusCode: number
  data: unknown
}

interface CboardAccountDependencies {
  apiBaseUrl: string
  request: (options: {
    url: string
    method: 'GET' | 'POST' | 'DELETE'
    data?: Record<string, unknown>
    header: Record<string, string>
  }) => Promise<RequestResult>
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isConfiguredOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function normalizeText(value: string, maxLength: number) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeReceiverTombstones(
  value: unknown
): ConfirmedReceiverTombstone[] {
  return (Array.isArray(value) ? value : [])
    .map(item => {
      const record = asObject(item)
      const id = String(record.id || '').trim()
      const deletedAt = Number(record.deletedAt)
      const deletedBy = String(record.deletedBy || '').trim()
      const serverVersion = Number(record.serverVersion)
      return id &&
        Number.isFinite(deletedAt) &&
        deletedAt > 0 &&
        deletedBy &&
        Number.isInteger(serverVersion) &&
        serverVersion > 0
        ? { id, deletedAt, deletedBy, serverVersion }
        : null
    })
    .filter(
      (item): item is ConfirmedReceiverTombstone => Boolean(item)
    )
}

function getServerMessage(value: unknown, fallback: string) {
  const message = asObject(value).message
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : fallback
}

function getRequestError(path: string, statusCode: number, data: unknown) {
  if (statusCode === 401 || statusCode === 403) {
    if (path === '/user/login/phone') {
      return '无法使用此手机号登录，请确认手机号已注册并重新获取验证码。'
    }
    if (path.startsWith('/user/phone-verification')) {
      return getServerMessage(data, '手机号验证码无效或已过期，请重新获取。')
    }
    return '邮箱或密码不正确，或登录已经失效。'
  }
  if (statusCode === 409) {
    return getServerMessage(data, '该邮箱已经注册，请登录或检查验证邮件。')
  }
  return getServerMessage(data, 'cboard-api 暂时不可用，请稍后重试。')
}

function validateEmail(value: string) {
  const email = normalizeText(value, 254).toLocaleLowerCase()
  return EMAIL_PATTERN.test(email) ? email : ''
}

function validatePassword(value: string) {
  const password = String(value || '')
  return password.length >= 6 && password.length <= 128 ? password : ''
}

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback
}

function normalizeOpaqueToken(value: unknown) {
  const token = String(value || '').trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(token) ? token : ''
}

function normalizeSubscriptionPrice(
  value: unknown
): NonNullable<CboardSubscriptionSummary['product']>['price'] {
  if (typeof value === 'string') return normalizeText(value, 80)
  const source = asObject(value)
  const currencyCode = normalizeText(String(source.currencyCode || ''), 12)
  const units = source.units
  const nanos = Number(source.nanos)
  return {
    ...(currencyCode ? { currencyCode } : {}),
    ...(typeof units === 'number' || typeof units === 'string'
      ? { units: typeof units === 'string' ? normalizeText(units, 32) : units }
      : {}),
    ...(Number.isFinite(nanos) ? { nanos } : {})
  }
}

export function normalizeCboardSubscriptionSummary(
  value: unknown
): CboardSubscriptionSummary | undefined {
  const source = asObject(value)
  const id = normalizeText(String(source.id || source._id || ''), 128)
  const status = normalizeText(String(source.status || ''), 40).toLowerCase()
  if (!id && !status) return undefined
  const rawProduct = asObject(source.product)
  const title = normalizeText(String(rawProduct.title || ''), 160)
  const billingPeriod = normalizeText(
    String(rawProduct.billingPeriod || ''),
    40
  )
  const expiryDate = normalizeText(String(source.expiryDate || ''), 64)
  return {
    id,
    status: status || 'not_subscribed',
    ...(expiryDate ? { expiryDate } : {}),
    ...(title || billingPeriod
      ? {
          product: {
            title,
            billingPeriod,
            price: normalizeSubscriptionPrice(rawProduct.price)
          }
        }
      : {})
  }
}

function normalizeAccountSession(
  value: unknown,
  fallbackEmail = ''
): CboardApiResult<CboardAccountSession> {
  const raw = asObject(value)
  const token = normalizeText(String(raw.authToken || ''), 4096)
  if (!token) {
    return { ok: false, message: '登录响应缺少授权令牌，请稍后重试。' }
  }
  const userId = normalizeText(String(raw.id || raw._id || ''), 128)
  if (!userId) {
    return { ok: false, message: '登录响应缺少账号标识，请稍后重试。' }
  }

  const phoneMasked = normalizeMaskedMainlandChinaPhone(
    String(raw.phoneMasked || '')
  )
  const subscription = normalizeCboardSubscriptionSummary(raw.subscriber)
  return {
    ok: true,
    message: '登录成功，可以同步常用语和沟通历史。',
    value: {
      token,
      user: {
        id: userId,
        name: normalizeText(String(raw.name || ''), 80),
        email:
          validateEmail(String(raw.email || fallbackEmail)) ||
          validateEmail(fallbackEmail),
        ...(phoneMasked ? { phoneMasked } : {})
      },
      settings: asObject(raw.settings),
      ...(subscription ? { subscription } : {})
    }
  }
}

export function createCboardAccountPort(
  dependencies: CboardAccountDependencies
): CboardAccountPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = isConfiguredOrigin(apiBaseUrl)

  async function request(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    data?: Record<string, unknown>,
    token = ''
  ): Promise<CboardApiResult<Record<string, unknown>>> {
    if (!configured) {
      return {
        ok: false,
        message: '尚未配置 cboard-api 地址，离线沟通仍可正常使用。'
      }
    }

    const authToken = String(token || '').trim()
    if (
      (
        path === '/settings' ||
        path === '/communication/receiver-records' ||
        path === '/communication/receiver-records/sync' ||
        path === '/communication/saved-phrases' ||
        path === '/communication/saved-phrases/sync' ||
        path.startsWith('/account/')
      ) &&
      !authToken
    ) {
      return { ok: false, message: '请先登录，再同步常用语和沟通历史。' }
    }

    const header: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (authToken) header.Authorization = `Bearer ${authToken}`

    try {
      const response = await dependencies.request({
        url: apiBaseUrl + path,
        method,
        data,
        header
      })
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          ok: false,
          message: getRequestError(path, response.statusCode, response.data)
        }
      }
      return {
        ok: true,
        message: '请求成功。',
        value: asObject(response.data)
      }
    } catch (error) {
      return {
        ok: false,
        message: '网络不可用，离线沟通仍可正常使用。'
      }
    }
  }

  return {
    configured,

    async getPhoneVerificationConfiguration() {
      const result = await request('/user/phone-verification', 'GET')
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      return {
        ok: true,
        message: '已读取手机号验证配置。',
        value: {
          available: Boolean(result.value.available),
          phoneLoginAvailable: Boolean(result.value.phoneLoginAvailable),
          phonePasswordResetAvailable: Boolean(
            result.value.phonePasswordResetAvailable
          ),
          requiredForPhoneRegistration: Boolean(
            result.value.requiredForPhoneRegistration
          ),
          challengeExpiresInSeconds: boundedInteger(
            result.value.challengeExpiresInSeconds,
            300,
            3600
          ),
          verificationExpiresInSeconds: boundedInteger(
            result.value.verificationExpiresInSeconds,
            600,
            3600
          ),
          resendAfterSeconds: boundedInteger(
            result.value.resendAfterSeconds,
            60,
            3600
          ),
          codeLength: 6
        }
      }
    },

    async requestPhoneVerification(input) {
      const phone = normalizeMainlandChinaPhone(input.phone)
      const purpose =
        input.purpose === 'login' || input.purpose === 'password-reset'
          ? input.purpose
          : 'registration'
      if (!isValidMainlandChinaPhone(phone)) {
        return {
          ok: false,
          message: '请输入中国大陆 11 位手机号后再获取验证码。'
        }
      }
      const result = await request('/user/phone-verification', 'POST', {
        phone,
        purpose
      })
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      const challengeId = normalizeOpaqueToken(result.value.challengeId)
      const phoneMasked = normalizeMaskedMainlandChinaPhone(
        String(result.value.phoneMasked || '')
      )
      if (!challengeId || !phoneMasked) {
        return { ok: false, message: '验证码响应不完整，请稍后重试。' }
      }
      return {
        ok: true,
        message: `验证码已发送至 ${phoneMasked}。`,
        value: {
          challengeId,
          phoneMasked,
          expiresInSeconds: boundedInteger(
            result.value.expiresInSeconds,
            300,
            3600
          ),
          resendAfterSeconds: boundedInteger(
            result.value.resendAfterSeconds,
            60,
            3600
          )
        }
      }
    },

    async confirmPhoneVerification(input) {
      const phone = normalizeMainlandChinaPhone(input.phone)
      const purpose =
        input.purpose === 'login' || input.purpose === 'password-reset'
          ? input.purpose
          : 'registration'
      const challengeId = normalizeOpaqueToken(input.challengeId)
      const code = String(input.code || '').trim()
      if (
        !isValidMainlandChinaPhone(phone) ||
        !challengeId ||
        !/^\d{6}$/.test(code)
      ) {
        return { ok: false, message: '请输入收到的 6 位手机验证码。' }
      }
      const result = await request(
        '/user/phone-verification/confirm',
        'POST',
        { challengeId, phone, code, purpose }
      )
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      const verificationToken = normalizeOpaqueToken(
        result.value.verificationToken
      )
      if (!verificationToken) {
        return { ok: false, message: '手机号验证响应不完整，请重新验证。' }
      }
      return {
        ok: true,
        message: '手机号验证成功。',
        value: {
          verificationToken,
          expiresInSeconds: boundedInteger(
            result.value.expiresInSeconds,
            600,
            3600
          )
        }
      }
    },

    async login(input) {
      const email = validateEmail(input.email)
      const password = validatePassword(input.password)
      if (!email || !password) {
        return {
          ok: false,
          message: '请输入有效邮箱和至少 6 位密码。'
        }
      }

      const result = await request('/user/login', 'POST', { email, password })
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      return normalizeAccountSession(result.value, email)
    },

    async loginWithPhone(input) {
      const phone = normalizeMainlandChinaPhone(input.phone)
      const phoneVerificationToken = normalizeOpaqueToken(
        input.phoneVerificationToken
      )
      if (
        !isValidMainlandChinaPhone(phone) ||
        !phoneVerificationToken
      ) {
        return {
          ok: false,
          message: '请先使用中国大陆手机号完成短信验证。'
        }
      }

      const result = await request('/user/login/phone', 'POST', {
        phone,
        phoneVerificationToken
      })
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      return normalizeAccountSession(result.value)
    },

    async register(input) {
      const name = normalizeText(input.name, 80)
      const email = validateEmail(input.email)
      const phone = normalizeMainlandChinaPhone(input.phone)
      const password = validatePassword(input.password)
      const phoneVerificationToken = normalizeOpaqueToken(
        input.phoneVerificationToken
      )
      if (
        !name ||
        !email ||
        !isValidMainlandChinaPhone(phone) ||
        !password
      ) {
        return {
          ok: false,
          message:
            '请输入姓名、有效邮箱、中国大陆 11 位手机号和至少 6 位密码。'
        }
      }

      const result = await request('/user', 'POST', {
        name,
        email,
        phone,
        password,
        ...(phoneVerificationToken ? { phoneVerificationToken } : {})
      })
      if (!result.ok) return { ok: false, message: result.message }
      return {
        ok: true,
        message: getServerMessage(
          result.value,
          '注册邮件已发送，请验证邮箱后再登录。'
        ),
        value: { requiresActivation: true }
      }
    },

    async requestPasswordReset(input) {
      const email = validateEmail(input.email)
      if (!email) {
        return {
          ok: false,
          message: '请输入有效邮箱后再发送重置邮件。'
        }
      }

      const result = await request('/user/forgot', 'POST', { email })
      if (!result.ok) return { ok: false, message: result.message }
      return {
        ok: true,
        message: '如果该邮箱已注册，密码重置邮件将很快发送，请检查收件箱和垃圾邮件。',
        value: { requested: true }
      }
    },

    async resetPasswordWithPhone(input) {
      const phone = normalizeMainlandChinaPhone(input.phone)
      const phoneVerificationToken = normalizeOpaqueToken(
        input.phoneVerificationToken
      )
      const password = validatePassword(input.password)
      if (
        !isValidMainlandChinaPhone(phone) ||
        !phoneVerificationToken ||
        !password
      ) {
        return {
          ok: false,
          message:
            '请先验证中国大陆手机号，并输入 6 到 128 位的新密码。'
        }
      }

      const result = await request('/user/store-password/phone', 'POST', {
        phone,
        phoneVerificationToken,
        password
      })
      if (!result.ok) return { ok: false, message: result.message }
      return {
        ok: true,
        message: '密码已重置，请使用新密码重新登录。',
        value: { reset: true }
      }
    },

    async deleteAccount(token, userId) {
      const accountId = normalizeText(userId, 128)
      if (!String(token || '').trim() || !accountId) {
        return {
          ok: false,
          message: '账号信息不完整，请重新登录后再删除云端账号。'
        }
      }

      const result = await request(
        `/account/${encodeURIComponent(accountId)}`,
        'DELETE',
        undefined,
        token
      )
      return result.ok
        ? {
            ok: true,
            message: 'CBoard 云端账号已永久删除。',
            value: { accountId }
          }
        : { ok: false, message: result.message }
    },

    async getSettings(token) {
      const result = await request('/settings', 'GET', undefined, token)
      return result.ok
        ? { ...result, message: '已读取云端沟通数据。' }
        : result
    },

    async updateSettings(token, patch) {
      const result = await request('/settings', 'POST', patch, token)
      return result.ok
        ? { ...result, message: '云端沟通数据已更新。' }
        : result
    },

    async syncConfirmedReceiverRecords(token, records) {
      const result = await request(
        '/communication/receiver-records/sync',
        'POST',
        { records: buildConfirmedReceiverSyncPayload(records) },
        token
      )
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      const deletedRecords = normalizeReceiverTombstones(
        result.value.deletedRecords
      )
      const deletedRecordIds = Array.from(
        new Set([
          ...(
            Array.isArray(result.value.deletedRecordIds)
              ? result.value.deletedRecordIds
              : []
          ),
          ...deletedRecords.map(record => record.id)
        ])
      )
        .map(value => String(value || '').trim())
        .filter(Boolean)

      return {
        ok: true,
        message: '已同步确认后的接收记录。',
        value: {
          acceptedCount: Number(result.value.acceptedCount) || 0,
          conflictCount: Number(result.value.conflictCount) || 0,
          conflictedRecordIds: Array.isArray(
            result.value.conflictedRecordIds
          )
            ? result.value.conflictedRecordIds
                .map(value => String(value || '').trim())
                .filter(Boolean)
            : [],
          records: Array.isArray(result.value.records)
            ? result.value.records as CommunicationHistoryEntry[]
            : [],
          deletedRecordIds,
          deletedRecords
        }
      }
    },

    async deleteConfirmedReceiverRecords(token, recordIds, options = {}) {
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(recordIds) ? recordIds : [])
            .map(value => String(value || '').trim())
            .filter(Boolean)
        )
      ).slice(0, 100)
      if (!options.deleteAll && !normalizedIds.length) {
        return {
          ok: true,
          message: '没有需要删除的接收记录。',
          value: {
            deletedCount: 0,
            deletedRecordIds: [],
            deletedRecords: []
          }
        }
      }

      const result = await request(
        '/communication/receiver-records',
        'DELETE',
        options.deleteAll
          ? { deleteAll: true }
          : { recordIds: normalizedIds },
        token
      )
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      const deletedRecords = normalizeReceiverTombstones(
        result.value.deletedRecords
      )

      return {
        ok: true,
        message: '接收记录已从云端删除。',
        value: {
          deletedCount: Number(result.value.deletedCount) || 0,
          deletedRecordIds: Array.isArray(result.value.deletedRecordIds)
            ? Array.from(
                new Set([
                  ...result.value.deletedRecordIds,
                  ...deletedRecords.map(record => record.id)
                ])
              )
                .map(value => String(value || '').trim())
                .filter(Boolean)
            : normalizedIds,
          deletedRecords
        }
      }
    },

    async syncCommunicationSavedPhrases(token, phrases) {
      const result = await request(
        '/communication/saved-phrases/sync',
        'POST',
        {
          phrases: buildCommunicationSavedPhraseSyncPayload(phrases)
        },
        token
      )
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      const deletedPhrases = normalizeSavedPhraseTombstones(
        result.value.deletedPhrases
      )
      const deletedPhraseIds = Array.from(
        new Set([
          ...(
            Array.isArray(result.value.deletedPhraseIds)
              ? result.value.deletedPhraseIds
              : []
          ),
          ...deletedPhrases.map(item => item.id)
        ])
      )
        .map(value => String(value || '').trim())
        .filter(Boolean)

      return {
        ok: true,
        message: '已同步逐条版本化常用语。',
        value: {
          acceptedCount: Number(result.value.acceptedCount) || 0,
          conflictCount: Number(result.value.conflictCount) || 0,
          conflictedPhraseIds: Array.isArray(
            result.value.conflictedPhraseIds
          )
            ? result.value.conflictedPhraseIds
                .map(value => String(value || '').trim())
                .filter(Boolean)
            : [],
          phrases: Array.isArray(result.value.phrases)
            ? result.value.phrases as CommunicationSavedPhraseEntry[]
            : [],
          deletedPhraseIds,
          deletedPhrases
        }
      }
    },

    async deleteCommunicationSavedPhrases(
      token,
      phraseIds,
      options = {}
    ) {
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(phraseIds) ? phraseIds : [])
            .map(value => String(value || '').trim())
            .filter(Boolean)
        )
      ).slice(0, 100)
      if (!options.deleteAll && !normalizedIds.length) {
        return {
          ok: true,
          message: '没有需要删除的常用语。',
          value: {
            deletedCount: 0,
            deletedPhraseIds: [],
            deletedPhrases: []
          }
        }
      }

      const result = await request(
        '/communication/saved-phrases',
        'DELETE',
        options.deleteAll
          ? { deleteAll: true }
          : { phraseIds: normalizedIds },
        token
      )
      if (!result.ok || !result.value) {
        return { ok: false, message: result.message }
      }
      const deletedPhrases = normalizeSavedPhraseTombstones(
        result.value.deletedPhrases
      )

      return {
        ok: true,
        message: '常用语删除标记已同步到云端。',
        value: {
          deletedCount: Number(result.value.deletedCount) || 0,
          deletedPhraseIds: Array.isArray(
            result.value.deletedPhraseIds
          )
            ? Array.from(
                new Set([
                  ...result.value.deletedPhraseIds,
                  ...deletedPhrases.map(item => item.id)
                ])
              )
                .map(value => String(value || '').trim())
                .filter(Boolean)
            : normalizedIds,
          deletedPhrases
        }
      }
    }
  }
}
