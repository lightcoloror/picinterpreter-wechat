import { describe, expect, test, vi } from 'vitest'

import { createCommunicationAiPort } from './communicationAiPort'

function createHarness(options: { apiBaseUrl?: string; token?: string } = {}) {
  const request = vi.fn(async ({ url }: { url: string }) => {
    if (url.endsWith('/usage')) {
      return {
        statusCode: 200,
        data: {
          month: '2026-07',
          requestCount: 3,
          reportedRequestCount: 2,
          unreportedRequestCount: 1,
          promptTokens: 40,
          completionTokens: 12,
          totalTokens: 52,
          providerReported: false,
          tokenQuota: {
            enabled: true,
            month: '2026-07',
            limitTokens: 1000000,
            consumedTokens: 52,
            remainingTokens: 999948,
            resetAt: '2026-08-01T00:00:00.000Z'
          },
          breakdown: []
        }
      }
    }
    if (url.endsWith('/sentences')) {
      return {
        statusCode: 200,
        data: {
          candidates: ['我想喝水。', '我想喝水。', '请给我水。'],
          provider: 'cboard-api-ai',
          isOfflineFallback: false
        }
      }
    }
    if (url.endsWith('/pictogram-generation')) {
      return {
        statusCode: 200,
        data: {
          imageBase64: 'aW1hZ2U=',
          mimeType: 'image/png',
          provider: 'openai-compatible',
          model: 'gpt-image-1',
          generationId: 'generation-1',
          useScope: 'device-private',
          sourceStored: false,
          publicLicenseDeclared: false,
          providerTermsApply: true
        }
      }
    }
    if (url.endsWith('/resegment')) {
      return {
        statusCode: 200,
        data: { tokens: ['我', '不开心', '越界词'], provider: 'cboard-api-ai' }
      }
    }
    if (url.endsWith('/dialect-normalization')) {
      return {
        statusCode: 200,
        data: {
          sourceText: '我想饮水',
          normalizedText: '我想喝水',
          dialect: 'cantonese',
          provider: 'cboard-api-ai',
          sourceStored: false
        }
      }
    }
    return {
      statusCode: 200,
      data: {
        configured: true,
        provider: 'openai-compatible',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.example.test/v1',
        imageAiConfigured: true,
        imageAiProvider: 'openai-compatible',
        imageAiModel: 'gpt-image-1',
        dialectAsrConfigured: true,
        dialectAsrProvider: 'tencentcloud-asr',
        dialectAsrEngine: '16k_yue',
        backgroundRemovalConfigured: true,
        backgroundRemovalProvider: 'rembg',
        speechConfigured: true,
        speechProvider: 'openai-compatible-speech',
        speechModel: 'gpt-4o-mini-tts',
        speechVoice: 'alloy',
        speechVoices: ['alloy', 'verse'],
        enhancementRateLimitEnabled: true,
        enhancementPointsPerMinute: 30,
        enhancementMonthlyPoints: 1000,
        aiTokenQuotaEnabled: true,
        aiMonthlyTokenQuota: 1000000,
        aiTextTokenReservation: 4096,
        aiImageTokenReservation: 32768
      }
    }
  })

  return {
    request,
    port: createCommunicationAiPort({
      apiBaseUrl: options.apiBaseUrl === undefined ? 'https://api.example.test' : options.apiBaseUrl,
      getAuthToken: () => options.token === undefined ? 'token' : options.token,
      request
    })
  }
}

describe('communicationAiPort', () => {
  test('keeps the server token in the Authorization header and bounds labels', async () => {
    const harness = createHarness()
    const result = await harness.port.generateSentences({
      pictogramLabels: Array.from({ length: 20 }, (_, index) => `词${index}`),
      candidateCount: 3,
      scene: 'hospital',
      candidateFeedback: [
        { sentence: '我要喝水', feedback: 'up' },
        { sentence: '给我茶', feedback: 'down' }
      ]
    })

    expect(result.value?.candidates).toEqual(['我想喝水。', '请给我水。'])
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/gpt/communication/sentences',
        header: expect.objectContaining({ Authorization: 'Bearer token' })
      })
    )
    const payload = harness.request.mock.calls[0][0].data as {
      pictogramLabels: string[]
      context: {
        scene: string
        candidateFeedback: Array<{
          sentence: string
          feedback: 'up' | 'down'
        }>
      }
    }
    expect(payload.pictogramLabels).toHaveLength(12)
    expect(payload.context.candidateFeedback).toEqual([
      { sentence: '我要喝水', feedback: 'up' },
      { sentence: '给我茶', feedback: 'down' }
    ])
    expect(payload.context.scene).toBe('hospital')
  })

  test('does not call the paid AI endpoint before login', async () => {
    const harness = createHarness({ token: '' })
    const result = await harness.port.generateSentences({ pictogramLabels: ['水'] })

    expect(result).toEqual(expect.objectContaining({ ok: false, message: expect.stringContaining('登录') }))
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('reports the configured provider without exposing credentials', async () => {
    const harness = createHarness()
    const result = await harness.port.health()

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: {
        configured: true,
        provider: 'openai-compatible',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.example.test/v1',
        imageAiConfigured: true,
        imageAiProvider: 'openai-compatible',
        imageAiModel: 'gpt-image-1',
        dialectAsrConfigured: true,
        dialectAsrProvider: 'tencentcloud-asr',
        dialectAsrEngine: '16k_yue',
        backgroundRemovalConfigured: true,
        backgroundRemovalProvider: 'rembg',
        speechConfigured: true,
        speechProvider: 'openai-compatible-speech',
        speechModel: 'gpt-4o-mini-tts',
        speechVoice: 'alloy',
        speechVoices: ['alloy', 'verse'],
        enhancementRateLimitEnabled: true,
        enhancementPointsPerMinute: 30,
        enhancementMonthlyPoints: 1000,
        aiTokenQuotaEnabled: true,
        aiMonthlyTokenQuota: 1000000,
        aiTextTokenReservation: 4096,
        aiImageTokenReservation: 32768
      }
    }))
    expect(result.value).not.toHaveProperty('apiKey')
  })

  test('reads only bounded numeric AI usage without communication content', async () => {
    const harness = createHarness()
    const result = await harness.port.usage()

    expect(result).toEqual({
      ok: true,
      message: 'AI 用量统计已读取。',
      value: {
        month: '2026-07',
        requestCount: 3,
        reportedRequestCount: 2,
        unreportedRequestCount: 1,
        promptTokens: 40,
        completionTokens: 12,
        totalTokens: 52,
        providerReported: false,
        tokenQuota: {
          enabled: true,
          month: '2026-07',
          limitTokens: 1000000,
          consumedTokens: 52,
          remainingTokens: 999948,
          resetAt: '2026-08-01T00:00:00.000Z'
        }
      }
    })
    expect(result.value).not.toHaveProperty('prompt')
    expect(result.value).not.toHaveProperty('text')
    expect(result.value).not.toHaveProperty('breakdown')
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/gpt/communication/usage',
        method: 'GET',
        header: expect.objectContaining({ Authorization: 'Bearer token' })
      })
    )
  })

  test('returns only a validated device-private generated pictogram', async () => {
    const harness = createHarness()
    const result = await harness.port.generatePictogram({
      label: '  紧急   求助  '
    })

    expect(result).toEqual({
      ok: true,
      message: 'AI 图符已生成，请照护者确认后保存。',
      value: {
        imageBase64: 'aW1hZ2U=',
        mimeType: 'image/png',
        provider: 'openai-compatible',
        model: 'gpt-image-1',
        generationId: 'generation-1',
        useScope: 'device-private',
        sourceStored: false,
        publicLicenseDeclared: false,
        providerTermsApply: true
      }
    })
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://api.example.test/gpt/communication/pictogram-generation',
        method: 'POST',
        data: { label: '紧急 求助' },
        header: expect.objectContaining({ Authorization: 'Bearer token' })
      })
    )
  })

  test('rejects a generated pictogram that claims a public license', async () => {
    const request = vi.fn(async () => ({
      statusCode: 200,
      data: {
        imageBase64: 'aW1hZ2U=',
        mimeType: 'image/png',
        provider: 'unexpected',
        model: 'image-model',
        generationId: 'generation-2',
        useScope: 'device-private',
        sourceStored: false,
        publicLicenseDeclared: true,
        providerTermsApply: true
      }
    }))
    const port = createCommunicationAiPort({
      apiBaseUrl: 'https://api.example.test',
      getAuthToken: () => 'token',
      request
    })

    const result = await port.generatePictogram({ label: '紧急求助' })

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        message: expect.stringContaining('未保存任何图片')
      })
    )
  })

  test('filters AI resegmentation against the local pictogram vocabulary', async function () {
    const harness = createHarness()
    const result = await harness.port.resegment({
      text: '我不开心',
      unmatchedTokens: ['不开心'],
      pictogramVocabulary: ['我', '不开心']
    })

    expect(result.value?.tokens).toEqual(['我', '不开心'])
  })

  test('returns a source-preserving editable Cantonese draft', async () => {
    const harness = createHarness()
    const result = await harness.port.normalizeDialect({
      text: '我想饮水',
      dialect: 'cantonese',
      pictogramVocabulary: ['我', '想', '喝水']
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          sourceText: '我想饮水',
          normalizedText: '我想喝水',
          dialect: 'cantonese',
          sourceStored: false,
          changed: true
        })
      })
    )
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://api.example.test/gpt/communication/dialect-normalization',
        data: expect.objectContaining({
          text: '我想饮水',
          dialect: 'cantonese'
        }),
        header: expect.objectContaining({
          Authorization: 'Bearer token'
        })
      })
    )
  })

  test('falls back safely when no API deployment is configured', async () => {
    const harness = createHarness({ apiBaseUrl: '' })
    const result = await harness.port.health()

    expect(result).toEqual(expect.objectContaining({ ok: false, message: expect.stringContaining('尚未配置') }))
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('distinguishes a monthly enhancement quota from a transient limit', async () => {
    const request = vi.fn(async () => ({
      statusCode: 429,
      data: {
        error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
      }
    }))
    const port = createCommunicationAiPort({
      apiBaseUrl: 'https://api.example.test',
      getAuthToken: () => 'token',
      request
    })

    const result = await port.generateSentences({
      pictogramLabels: ['喝水']
    })

    expect(result.message).toContain('本月增强服务额度已用完')
    expect(result.message).toContain('本地规则')
  })

  test('uses the same safe local fallback when the AI token allowance is exhausted', async () => {
    const request = vi.fn(async () => ({
      statusCode: 429,
      data: {
        error: { code: 'COMMUNICATION_AI_TOKEN_QUOTA_EXCEEDED' }
      }
    }))
    const port = createCommunicationAiPort({
      apiBaseUrl: 'https://api.example.test',
      getAuthToken: () => 'token',
      request
    })

    const result = await port.generateSentences({
      pictogramLabels: ['喝水']
    })

    expect(result.message).toContain('本月增强服务额度已用完')
    expect(result.message).toContain('本地规则')
  })
})
