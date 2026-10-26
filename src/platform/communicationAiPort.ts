import { getExpressionDraftRequestContext } from '@cboard-communication-core/expressionDraft'
import type { ConversationScene } from '@cboard-communication-core/conversationSession'
import {
  normalizeResegmentResponse,
  validateResegmentSource
} from '@cboard-communication-core/communicationAi'
import type { CommunicationAiResegmentResponse as CoreResegmentResponse } from '@cboard-communication-core/communicationAi'
import {
  buildDialectNormalizationRequest,
  normalizeDialectNormalizationResponse
} from '@cboard-communication-core/dialectNormalization'
import { careErrorMessage } from '@cboard-communication-core/careErrors'
import { getPrivatePersonRequestIdentity, restorePrivatePersonAiResponse } from '@cboard-communication-core/privatePersonAi'
import { getCommunicationEnhancementLimitMessage } from './communicationEnhancementError'

export interface CommunicationAiResult<T> {
  ok: boolean
  message: string
  value?: T
  code?: string
  status?: number
}

export interface CommunicationAiSentenceResponse {
  candidates: string[]
  provider: string
  isOfflineFallback: boolean
}

export interface CommunicationAiCandidateFeedback {
  sentence: string
  feedback: 'up' | 'down'
}

export type CommunicationAiResegmentResponse = CoreResegmentResponse

export interface CommunicationDialectNormalizationResponse {
  sourceText: string
  normalizedText: string
  dialect: 'cantonese'
  provider: string
  sourceStored: false
  changed: boolean
}

export interface CommunicationAiPictogramResponse {
  imageBase64: string
  mimeType: 'image/png'
  provider: string
  model: string
  generationId: string
  useScope: 'device-private'
  sourceStored: false
  publicLicenseDeclared: false
  providerTermsApply: true
}

export interface CommunicationAiHealth {
  configured: boolean
  provider: string
  model: string
  baseUrl: string
  imageAiConfigured: boolean
  imageAiProvider: string
  imageAiModel: string
  dialectAsrConfigured: boolean
  dialectAsrProvider: string
  dialectAsrEngine: string
  backgroundRemovalConfigured: boolean
  backgroundRemovalProvider: string
  speechConfigured: boolean
  speechProvider: string
  speechModel: string
  speechVoice: string
  speechVoices: string[]
  enhancementRateLimitEnabled: boolean
  enhancementPointsPerMinute: number
  enhancementMonthlyPoints: number
  aiTokenQuotaEnabled: boolean
  aiMonthlyTokenQuota: number
  aiTextTokenReservation: number
  aiImageTokenReservation: number
}

export interface CommunicationAiTokenQuota {
  enabled: boolean
  month: string
  limitTokens: number
  consumedTokens: number
  remainingTokens: number
  resetAt: string
}

export interface CommunicationAiUsage {
  month: string
  requestCount: number
  reportedRequestCount: number
  unreportedRequestCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  providerReported: boolean
  tokenQuota?: CommunicationAiTokenQuota
}

export interface CommunicationAiPort {
  readonly configured: boolean
  health(): Promise<CommunicationAiResult<CommunicationAiHealth>>
  usage(): Promise<CommunicationAiResult<CommunicationAiUsage>>
  generateSentences(input: {
    pictogramLabels: string[]
    candidateCount?: number
    recentSentences?: string[]
    candidateFeedback?: CommunicationAiCandidateFeedback[]
    scene?: ConversationScene
    context?: { recentSentences?: string[]; candidateFeedback?: CommunicationAiCandidateFeedback[]; scene?: ConversationScene }
  }): Promise<CommunicationAiResult<CommunicationAiSentenceResponse>>
  generatePictogram(input: {
    label: string
  }): Promise<CommunicationAiResult<CommunicationAiPictogramResponse>>
  resegment(input: {
    text: string
    unmatchedTokens?: string[]
    pictogramVocabulary?: string[]
  }): Promise<CommunicationAiResult<CommunicationAiResegmentResponse>>
  normalizeDialect(input: {
    text: string
    dialect: 'cantonese'
    pictogramVocabulary?: string[]
  }): Promise<
    CommunicationAiResult<CommunicationDialectNormalizationResponse>
  >
}

interface RequestResult {
  statusCode: number
  data: unknown
}

function responseErrorCode(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const payload = data as Record<string, unknown>
  const nested = payload.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown> : null
  return String(payload.code || nested?.code || '')
}

interface CommunicationAiDependencies {
  apiBaseUrl: string
  // Undefined preserves legacy callers; an explicit empty URL disables text AI.
  textApiBaseUrl?: string
  getAuthToken: () => string
  request: (options: {
    url: string
    method: 'GET' | 'POST'
    data?: Record<string, unknown>
    localIdentity?: string
    draftContext?: any
    header: Record<string, string>
  }) => Promise<RequestResult>
}

const MAX_LABELS = 12
const MAX_LABEL_LENGTH = 24
const MAX_CANDIDATES = 5
const MAX_CONTEXT_SENTENCES = 6
const MAX_TEXT_LENGTH = 120
const MAX_VOCABULARY_ITEMS = 200
const MAX_GENERATED_IMAGE_BASE64_LENGTH = 2796208

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function hasHttpOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function normalizeList(values: string[] | undefined, maxItems: number, maxLength: number, preserveOccurrences = false) {
  const seen = new Set<string>()

  return (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength))
    .filter(value => {
      if (!value || !preserveOccurrences && seen.has(value)) return false
      seen.add(value)
      return true
    })
    .slice(0, maxItems)
}

function getErrorMessage(statusCode: number, responseData: unknown) {
  const code = responseErrorCode(responseData)
  if (code) {
    const known = careErrorMessage({ code, message: '' })
    if (known !== careErrorMessage({ message: '' })) return known
  }
  const limitMessage = getCommunicationEnhancementLimitMessage(
    statusCode,
    responseData,
    '已继续使用本地规则。'
  )
  if (limitMessage) return limitMessage
  if (statusCode === 401) return '登录已失效，请重新登录后使用 AI。'
  if (statusCode === 403) return '当前账号没有使用此 AI 服务的权限，请核对档案与额度授权。'
  if (statusCode === 503) return '服务端尚未配置 AI，已继续使用本地规则。'
  return 'AI 服务暂时不可用，已继续使用本地规则。'
}

function normalizeResponseList(value: unknown, maxItems: number, maxLength: number) {
  return normalizeList(Array.isArray(value) ? value.map(String) : [], maxItems, maxLength)
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number
) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback
}

function normalizeNonNegativeInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function normalizeCandidateFeedback(
  value: CommunicationAiCandidateFeedback[] | undefined
) {
  return (Array.isArray(value) ? value : [])
    .map(item => ({
      sentence: String(item && item.sentence || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_TEXT_LENGTH),
      feedback:
        item && (item.feedback === 'up' || item.feedback === 'down')
          ? item.feedback
          : null
    }))
    .filter(
      (item): item is CommunicationAiCandidateFeedback =>
        Boolean(item.sentence && item.feedback)
    )
    .slice(0, MAX_CONTEXT_SENTENCES)
}

export function createCommunicationAiPort(
  dependencies: CommunicationAiDependencies
): CommunicationAiPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const textApiBaseUrl = normalizeBaseUrl(dependencies.textApiBaseUrl === undefined
    ? dependencies.apiBaseUrl : dependencies.textApiBaseUrl)
  const configured = hasHttpOrigin(textApiBaseUrl)

  async function requestAuthenticated(
    path: string,
    method: 'GET' | 'POST',
    data?: Record<string, unknown>,
    localIdentity?: string,
    draftContext?: any
  ): Promise<CommunicationAiResult<unknown>> {
    const textOperation = ['/gpt/communication/sentences', '/gpt/communication/resegment',
      '/gpt/communication/health', '/gpt/communication/usage'].includes(path)
    const requestBaseUrl = textOperation ? textApiBaseUrl : apiBaseUrl
    if (!hasHttpOrigin(requestBaseUrl)) {
      return { ok: false, message: 'AI 服务尚未配置，已继续使用本地规则。' }
    }

    const token = String(dependencies.getAuthToken() || '').trim()
    if (!token) {
      return { ok: false, message: '登录后可使用 AI 增强，当前继续使用本地规则。' }
    }

    try {
      const response = await dependencies.request({
        url: requestBaseUrl + path,
        method,
        data,
        ...(localIdentity ? { localIdentity } : {}),
        ...(draftContext ? { draftContext } : {}),
        header: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const code = responseErrorCode(response.data)
        return {
          ok: false,
          message: getErrorMessage(response.statusCode, response.data),
          ...(code ? { code } : {}),
          status: response.statusCode
        }
      }
      return { ok: true, message: 'AI 增强已完成。', value: response.data }
    } catch (error: any) {
      if (typeof error?.code === 'string' && error.code.startsWith('EXPRESSION_DRAFT_')) {
        return { ok: false, code: error.code, message: error.message || '表达草稿未能可靠保存到本机，未发起 AI 请求。' }
      }
      // The transport records an uncertain attempt before returning its stable
      // code. Do not turn it into a fresh paid call or discard that distinction.
      if (['AI_REQUEST_STORAGE_UNAVAILABLE', 'AI_REQUEST_CONTEXT_CHANGED',
        'AI_REQUEST_RESULT_UNKNOWN', 'AI_REQUEST_INPUT_CHANGED', 'EXPLICIT_FUNDING_REQUIRED',
        'PROFILE_ACCESS_DENIED'].includes(error?.code)) {
        return { ok: false, code: error.code, message: careErrorMessage(error) }
      }
      return { ok: false, message: '网络不可用，已继续使用本地规则。' }
    }
  }

  return {
    configured,

    async health() {
      const result = await requestAuthenticated('/gpt/communication/health', 'GET')
      if (!result.ok) return { ok: false, message: result.message, code: result.code, status: result.status }

      const raw = result.value as Record<string, unknown>
      const speechVoice = String(raw.speechVoice || '').trim().slice(0, 80)
      const speechVoices = normalizeResponseList(
        raw.speechVoices,
        20,
        80
      )
      if (speechVoice && !speechVoices.includes(speechVoice)) {
        speechVoices.unshift(speechVoice)
      }
      return {
        ok: true,
        message: raw.configured ? 'AI 增强可用。' : '服务端未配置 AI。',
        value: {
          configured: Boolean(raw.configured),
          provider: String(raw.provider || ''),
          model: String(raw.model || ''),
          baseUrl: String(raw.baseUrl || ''),
          imageAiConfigured:
            raw.imageAiConfigured === undefined
              ? Boolean(raw.configured)
              : Boolean(raw.imageAiConfigured),
          imageAiProvider: String(raw.imageAiProvider || ''),
          imageAiModel: String(raw.imageAiModel || ''),
          dialectAsrConfigured: Boolean(raw.dialectAsrConfigured),
          dialectAsrProvider: String(raw.dialectAsrProvider || ''),
          dialectAsrEngine: String(raw.dialectAsrEngine || ''),
          backgroundRemovalConfigured: Boolean(
            raw.backgroundRemovalConfigured
          ),
          backgroundRemovalProvider: String(
            raw.backgroundRemovalProvider || ''
          ),
          speechConfigured: Boolean(raw.speechConfigured),
          speechProvider: String(raw.speechProvider || ''),
          speechModel: String(raw.speechModel || ''),
          speechVoice,
          speechVoices,
          enhancementRateLimitEnabled: Boolean(
            raw.enhancementRateLimitEnabled
          ),
          enhancementPointsPerMinute: normalizePositiveInteger(
            raw.enhancementPointsPerMinute,
            30,
            10000
          ),
          enhancementMonthlyPoints: normalizePositiveInteger(
            raw.enhancementMonthlyPoints,
            1000,
            10000000
          ),
          aiTokenQuotaEnabled: Boolean(raw.aiTokenQuotaEnabled),
          aiMonthlyTokenQuota: normalizePositiveInteger(
            raw.aiMonthlyTokenQuota,
            1000000,
            1000000000
          ),
          aiTextTokenReservation: normalizePositiveInteger(
            raw.aiTextTokenReservation,
            4096,
            1000000000
          ),
          aiImageTokenReservation: normalizePositiveInteger(
            raw.aiImageTokenReservation,
            32768,
            1000000000
          )
        }
      }
    },

    async usage() {
      const result = await requestAuthenticated('/gpt/communication/usage', 'GET')
      if (!result.ok) return { ok: false, message: result.message, code: result.code, status: result.status }

      const raw = result.value as Record<string, unknown>
      const month = String(raw.month || '').trim()
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return { ok: false, message: 'AI 用量统计格式无效。' }
      }
      const rawQuota =
        raw.tokenQuota &&
        typeof raw.tokenQuota === 'object' &&
        !Array.isArray(raw.tokenQuota)
          ? raw.tokenQuota as Record<string, unknown>
          : null
      const quotaMonth = String((rawQuota && rawQuota.month) || '').trim()
      const tokenQuota =
        rawQuota && /^\d{4}-\d{2}$/.test(quotaMonth)
          ? {
              enabled: Boolean(rawQuota.enabled),
              month: quotaMonth,
              limitTokens: normalizePositiveInteger(
                rawQuota.limitTokens,
                1000000,
                1000000000
              ),
              consumedTokens: normalizeNonNegativeInteger(
                rawQuota.consumedTokens
              ),
              remainingTokens: normalizeNonNegativeInteger(
                rawQuota.remainingTokens
              ),
              resetAt: String(rawQuota.resetAt || '').trim().slice(0, 40)
            }
          : undefined

      return {
        ok: true,
        message: 'AI 用量统计已读取。',
        value: {
          month,
          requestCount: normalizeNonNegativeInteger(raw.requestCount),
          reportedRequestCount: normalizeNonNegativeInteger(
            raw.reportedRequestCount
          ),
          unreportedRequestCount: normalizeNonNegativeInteger(
            raw.unreportedRequestCount
          ),
          promptTokens: normalizeNonNegativeInteger(raw.promptTokens),
          completionTokens: normalizeNonNegativeInteger(
            raw.completionTokens
          ),
          totalTokens: normalizeNonNegativeInteger(raw.totalTokens),
          providerReported: Boolean(raw.providerReported),
          ...(tokenQuota ? { tokenQuota } : {})
        }
      }
    },

    async generateSentences(input) {
      let localIdentity: string
      try { localIdentity = getPrivatePersonRequestIdentity(input) }
      catch (_) { return { ok: false, code: 'AI_PERSON_REFERENCE_MISMATCH', message: '人物选择信息已失效，请重新确认；未发起 AI 请求。' } }
      const pictogramLabels = normalizeList(input.pictogramLabels, MAX_LABELS, MAX_LABEL_LENGTH, true)
      if (!pictogramLabels.length) {
        return { ok: false, message: '请先选择图片，再生成候选句。' }
      }

      const candidateCount = Math.max(1, Math.min(MAX_CANDIDATES, Number(input.candidateCount) || 3))
      const result = await requestAuthenticated(
        '/gpt/communication/sentences',
        'POST',
        {
          pictogramLabels,
          candidateCount,
          context: {
            recentSentences: normalizeList(
              input.context?.recentSentences || input.recentSentences,
              MAX_CONTEXT_SENTENCES,
              MAX_TEXT_LENGTH
            ),
            candidateFeedback: normalizeCandidateFeedback(
              input.context?.candidateFeedback || input.candidateFeedback
            ),
            ...(input.context?.scene || input.scene ? { scene: input.context?.scene || input.scene } : {})
          }
        }, localIdentity, getExpressionDraftRequestContext(input)
      )
      if (!result.ok) return { ok: false, message: result.message,
        ...(result.code ? { code: result.code } : {}),
        ...(result.status ? { status: result.status } : {}) }

      let raw: Record<string, unknown>
      try { raw = restorePrivatePersonAiResponse(input, result.value, 'communication-sentences') as Record<string, unknown> }
      catch (_) { return { ok: false, code: 'AI_PERSON_REFERENCE_MISMATCH', message: 'AI 未保留人物身份，已保留本地候选。' } }
      const candidates = normalizeResponseList(
        raw.candidates,
        candidateCount,
        MAX_TEXT_LENGTH
      )
      if (!candidates.length) {
        return { ok: false, message: 'AI 未返回可用句子，已保留本地候选。' }
      }

      return {
        ok: true,
        message: '已生成 AI 候选句。',
        value: {
          candidates,
          provider: String(raw.provider || 'cboard-api-ai'),
          isOfflineFallback: false
        }
      }
    },

    async generatePictogram(input) {
      const label = String(input && input.label || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_LABEL_LENGTH)
      if (!label) {
        return { ok: false, message: '请输入需要生成图符的缺词。' }
      }

      const result = await requestAuthenticated(
        '/gpt/communication/pictogram-generation',
        'POST',
        { label }
      )
      if (!result.ok) return { ok: false, message: result.message }

      const raw = result.value as Record<string, unknown>
      const imageBase64 = String(raw.imageBase64 || '')
      const provider = String(raw.provider || '').trim().slice(0, 80)
      const model = String(raw.model || '').trim().slice(0, 160)
      const generationId = String(raw.generationId || '').trim().slice(0, 128)
      if (
        !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) ||
        imageBase64.length > MAX_GENERATED_IMAGE_BASE64_LENGTH ||
        raw.mimeType !== 'image/png' ||
        !provider ||
        !model ||
        !generationId ||
        raw.useScope !== 'device-private' ||
        raw.sourceStored !== false ||
        raw.publicLicenseDeclared !== false ||
        raw.providerTermsApply !== true
      ) {
        return {
          ok: false,
          message: '服务端返回的 AI 图符格式无效，未保存任何图片。'
        }
      }

      return {
        ok: true,
        message: 'AI 图符已生成，请照护者确认后保存。',
        value: {
          imageBase64,
          mimeType: 'image/png',
          provider,
          model,
          generationId,
          useScope: 'device-private',
          sourceStored: false,
          publicLicenseDeclared: false,
          providerTermsApply: true
        }
      }
    },

    async normalizeDialect(input) {
      const request = buildDialectNormalizationRequest(input)
      if (!request.text || !request.dialect) {
        return { ok: false, message: '请输入需要转换的粤语文字。' }
      }
      const result = await requestAuthenticated(
        '/gpt/communication/dialect-normalization',
        'POST',
        { ...request }
      )
      if (!result.ok) return { ok: false, message: result.message }

      const normalized = normalizeDialectNormalizationResponse(
        result.value,
        {
          sourceText: request.text,
          dialect: request.dialect
        }
      )
      if (!normalized) {
        return {
          ok: false,
          message: '服务端返回的粤语转换结果无效，已保留原文。'
        }
      }
      return {
        ok: true,
        message: '粤语转换草稿已返回，请人工确认。',
        value: normalized
      }
    },

    async resegment(input) {
      let localIdentity: string
      try { localIdentity = getPrivatePersonRequestIdentity(input) }
      catch (_) { return { ok: false, code: 'AI_PERSON_REFERENCE_MISMATCH', message: '人物选择信息已失效，请重新确认；未发起 AI 请求。' } }
      const text = input.text
      if (!validateResegmentSource(text)) {
        return { ok: false, message: 'AI 优化支持 1–120 字，请分段处理；原文已保留。' }
      }

      const vocabulary = normalizeList(
        input.pictogramVocabulary,
        MAX_VOCABULARY_ITEMS,
        MAX_LABEL_LENGTH
      )
      const result = await requestAuthenticated(
        '/gpt/communication/resegment',
        'POST',
        {
          contractVersion: 2,
          text,
          unmatchedTokens: normalizeList(
            input.unmatchedTokens,
            MAX_LABELS,
            MAX_LABEL_LENGTH
          ),
          pictogramVocabulary: vocabulary
        }, localIdentity
      )
      if (!result.ok) return { ok: false, message: result.message,
        ...(result.code ? { code: result.code } : {}),
        ...(result.status ? { status: result.status } : {}) }

      let normalized: CommunicationAiResegmentResponse | null
      try { normalized = restorePrivatePersonAiResponse(input, normalizeResegmentResponse(text, result.value), 'communication-resegment') as CommunicationAiResegmentResponse | null }
      catch (_) { return { ok: false, code: 'AI_PERSON_REFERENCE_MISMATCH', message: 'AI 未保留人物身份，已保留当前结果。' } }
      if (!normalized) {
        return { ok: false, message: 'AI 建议未完整保留原文，已保留当前结果，请继续人工修正。' }
      }

      return {
        ok: true,
        message: 'AI 分词已返回，请照护者确认后应用。',
        value: normalized
      }
    }
  }
}
