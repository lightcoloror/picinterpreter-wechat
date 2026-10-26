import { describe, expect, test, vi } from 'vitest'
import { evaluateCareTextAiAvailability } from '@cboard-communication-core/careAiAvailability'
import { createRuntimeCapabilities, apiBaseUrlFor } from '../config/runtimeCapabilities'
import { createCommunicationAiPort } from './communicationAiPort'

describe('text-only production candidate', () => {
  const environment = { releaseChannel: 'production', apiBaseUrl: 'https://tuyujia.com.cn/api',
    enableAiFeatures: 'false', enableTextAiFeatures: 'true' }
  test('text flag cannot enable image, voice, OCR or insecure production endpoints', () => {
    const flags = createRuntimeCapabilities(environment)
    expect(flags).toMatchObject({ textAiFeatures: true, aiFeatures: false, ocr: false, dialectAsr: false })
    expect(apiBaseUrlFor('aiFeatures', flags)).toBe('')
    expect(apiBaseUrlFor('textAiFeatures', flags)).toBe(environment.apiBaseUrl)
    expect(createRuntimeCapabilities({ ...environment, apiBaseUrl: 'http://localhost' }).textAiFeatures).toBe(false)
    expect(createRuntimeCapabilities({ ...environment, enableTextAiFeatures: '', enableAiFeatures: 'true' }).textAiFeatures).toBe(true)
    expect(createRuntimeCapabilities({ ...environment, enableTextAiFeatures: 'false', enableAiFeatures: 'true' }).textAiFeatures).toBe(false)
  })
  test('only four text endpoints use the separate base; no implicit general-AI fallback', async () => {
    const request = vi.fn(async () => ({ statusCode: 401, data: { code: 'LOGIN_REQUIRED' } }))
    const port = createCommunicationAiPort({ apiBaseUrl: '', textApiBaseUrl: environment.apiBaseUrl,
      getAuthToken: () => 'synthetic-token', request })
    expect(port.configured).toBe(true)
    for (const call of [() => port.health(), () => port.usage(),
      () => port.generateSentences({ pictogramLabels: ['喝水'] }),
      () => port.resegment({ text: '我不喝水' })]) {
      expect((await call()).code).toBe('LOGIN_REQUIRED')
    }
    expect(request).toHaveBeenCalledTimes(4)
    expect((await port.generatePictogram({ label: '杯子' })).ok).toBe(false)
    expect((await port.normalizeDialect({ text: '饮水', dialect: 'cantonese' })).ok).toBe(false)
    expect(request).toHaveBeenCalledTimes(4)
  })
  test.each(['PROFILE_ACCESS_DENIED', 'FUNDING_ACCESS_DENIED', 'AI_QUOTA_EXCEEDED', 'AI_REQUEST_PENDING_RECONCILIATION'])(
    'preserves %s at the actual port without falsely requesting a new login', async code => {
      const port = createCommunicationAiPort({ apiBaseUrl: '', textApiBaseUrl: environment.apiBaseUrl,
        getAuthToken: () => 'synthetic-token', request: async () => ({ statusCode: 403, data: { code } }) })
      const result = await port.generateSentences({ pictogramLabels: ['喝水'] })
      expect(result.code).toBe(code)
      expect(result.message).not.toContain('重新登录')
    })
  test('one pure policy covers build, login, profile, lock, explicit funding and known insufficient quota', () => {
    const ready = { enabled: true, isLogged: true, accountId: 'synthetic', careMode: true,
      profile: { id: 'p', locked: false }, fundingId: 'f' }
    expect(evaluateCareTextAiAvailability(ready).available).toBe(true)
    for (const [patch, code] of [
      [{ enabled: false }, 'TEXT_AI_DISABLED'], [{ isLogged: false }, 'LOGIN_REQUIRED'],
      [{ profile: null }, 'PROFILE_REQUIRED'], [{ profile: { id: 'p', locked: true } }, 'PROFILE_ACCESS_DENIED'],
      [{ fundingId: '' }, 'EXPLICIT_FUNDING_REQUIRED'], [{ quotaInsufficient: true }, 'AI_QUOTA_EXCEEDED'],
      [{ storageFailed: true }, 'AI_REQUEST_STORAGE_UNAVAILABLE']
    ] as const) expect(evaluateCareTextAiAvailability({ ...ready, ...patch }).code).toBe(code)
  })
})
