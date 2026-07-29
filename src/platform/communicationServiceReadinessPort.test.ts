import { describe, expect, test, vi } from 'vitest'

import { createCommunicationServiceReadinessPort } from './communicationServiceReadinessPort'

function createHarness(
  response: { statusCode: number; data: unknown } = {
    statusCode: 200,
    data: {
      status: 'ok',
      database: 'connected',
      communicationIndexes: 'ready',
      privatePictureLibrary: 'configured'
    }
  },
  apiBaseUrl = 'https://api.example.test/'
) {
  const request = vi.fn(async () => response)
  return {
    request,
    port: createCommunicationServiceReadinessPort({ apiBaseUrl, request })
  }
}

describe('communicationServiceReadinessPort', () => {
  test('checks the existing public health endpoint without an auth token', async () => {
    const harness = createHarness()
    const result = await harness.port.check()

    expect(result.ok).toBe(true)
    expect(result.value?.ready).toBe(true)
    expect(result.message).toContain('均已就绪')
    expect(harness.request).toHaveBeenCalledWith({
      url: 'https://api.example.test/health',
      method: 'GET',
      header: { Accept: 'application/json' }
    })
  })

  test('keeps a 503 health body visible as a reachable degraded service', async () => {
    const harness = createHarness({
      statusCode: 503,
      data: {
        status: 'degraded',
        database: 'connected',
        communicationIndexes: 'building',
        privatePictureLibrary: 'unconfigured'
      }
    })
    const result = await harness.port.check()

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(expect.objectContaining({
      ready: false,
      communicationIndexes: 'building'
    }))
    expect(result.message).toContain('通信索引正在建立')
  })

  test('does not send a request when no API URL is configured', async () => {
    const harness = createHarness(undefined, '')
    const result = await harness.port.check()

    expect(result.ok).toBe(false)
    expect(result.message).toContain('尚未配置')
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('fails closed for malformed and unreachable health responses', async () => {
    const malformed = createHarness({ statusCode: 200, data: { ready: true } })
    expect(await malformed.port.check()).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('无法识别')
    }))

    const request = vi.fn(async () => {
      throw new Error('offline')
    })
    const unavailable = createCommunicationServiceReadinessPort({
      apiBaseUrl: 'https://api.example.test',
      request
    })
    expect(await unavailable.check()).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('无法连接')
    }))
  })
})
