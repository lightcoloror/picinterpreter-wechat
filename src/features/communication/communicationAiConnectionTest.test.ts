import { describe, expect, it, vi } from 'vitest'
import { runCommunicationAiConnectionTest } from './communicationAiConnectionTest'

describe('communication AI connection test', () => {
  it('uses only fixed non-patient labels and returns the live candidate', async () => {
    const generateSentences = vi.fn().mockResolvedValue({
      ok: true,
      message: 'ok',
      value: {
        candidates: ['我想喝水'],
        provider: 'cboard-api-ai',
        isOfflineFallback: false
      }
    })

    const result = await runCommunicationAiConnectionTest({
      generateSentences
    })

    expect(generateSentences).toHaveBeenCalledWith({
      pictogramLabels: ['我', '喝水'],
      candidateCount: 1
    })
    expect(result).toEqual({
      ok: true,
      message: 'AI 真实连接成功：我想喝水'
    })
  })

  it('keeps the bounded port error for quota and configuration failures', async () => {
    const result = await runCommunicationAiConnectionTest({
      generateSentences: vi.fn().mockResolvedValue({
        ok: false,
        message: '本月增强服务额度已用完，已继续使用本地规则。'
      })
    })

    expect(result).toEqual({
      ok: false,
      message: '本月增强服务额度已用完，已继续使用本地规则。'
    })
  })

  it('does not treat an empty or throwing provider response as success', async () => {
    const emptyResult = await runCommunicationAiConnectionTest({
      generateSentences: vi.fn().mockResolvedValue({
        ok: true,
        message: 'ok',
        value: {
          candidates: [],
          provider: 'cboard-api-ai',
          isOfflineFallback: false
        }
      })
    })
    const thrownResult = await runCommunicationAiConnectionTest({
      generateSentences: vi.fn().mockRejectedValue(new Error('secret'))
    })

    expect(emptyResult.ok).toBe(false)
    expect(thrownResult).toEqual({
      ok: false,
      message: 'AI 真实连接测试失败，本地沟通仍可正常使用。'
    })
  })

  it('releases the settings UI when the provider does not respond', async () => {
    vi.useFakeTimers()
    try {
      const resultPromise = runCommunicationAiConnectionTest(
        {
          generateSentences: vi.fn(
            () => new Promise(() => {})
          )
        },
        { timeoutMs: 25 }
      )

      await vi.advanceTimersByTimeAsync(25)

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        message:
          'AI 真实连接测试等待超过 10 秒，请检查网络或服务商。本地沟通仍可正常使用。'
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
