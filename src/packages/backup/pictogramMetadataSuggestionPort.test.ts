import { describe, expect, it, vi } from 'vitest'

import { createPictogramMetadataSuggestionPort } from './pictogramMetadataSuggestionPort'

function createHarness(overrides: Record<string, unknown> = {}) {
  const dependencies = {
    apiBaseUrl: 'https://api.example.test/',
    getAuthToken: vi.fn(() => 'token'),
    compressImage: vi.fn(async () => ({
      tempFilePath: 'wxfile://compressed.jpg'
    })),
    getFileSize: vi.fn(async () => 1024),
    uploadFile: vi.fn(async () => ({
      statusCode: 200,
      data: JSON.stringify({
        label: '苹果',
        synonyms: ['水果'],
        category: '饮食',
        provider: 'cboard-api-ai',
        sourceStored: false
      })
    })),
    ...overrides
  }
  return {
    dependencies,
    port: createPictogramMetadataSuggestionPort(dependencies)
  }
}

describe('pictogram metadata suggestion port', () => {
  it('uploads an authenticated transient image and normalizes the result', async () => {
    const harness = createHarness()

    await expect(
      harness.port.suggest('wxfile://saved/apple.jpg')
    ).resolves.toEqual({
      ok: true,
      message: '建议已填入空白字段，请检查并修改后再保存。',
      value: {
        label: '苹果',
        synonyms: ['水果'],
        category: '饮食',
        provider: 'cboard-api-ai',
        sourceStored: false
      }
    })
    expect(harness.dependencies.uploadFile).toHaveBeenCalledWith({
      url:
        'https://api.example.test/gpt/communication/pictogram-metadata',
      filePath: 'wxfile://saved/apple.jpg',
      name: 'image',
      header: { Authorization: 'Bearer token' }
    })
  })

  it('compresses once before upload when the source exceeds 2 MiB', async () => {
    const harness = createHarness({
      getFileSize: vi
        .fn()
        .mockResolvedValueOnce(3 * 1024 * 1024)
        .mockResolvedValueOnce(900 * 1024)
    })

    const result = await harness.port.suggest('wxfile://large.jpg')

    expect(result.ok).toBe(true)
    expect(harness.dependencies.compressImage).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'wxfile://compressed.jpg'
      })
    )
  })

  it('checks configuration and login before reading the file', async () => {
    const unconfigured = createHarness({ apiBaseUrl: '' })
    const loggedOut = createHarness({
      getAuthToken: vi.fn(() => '')
    })

    expect((await unconfigured.port.suggest('photo.jpg')).ok).toBe(false)
    expect((await loggedOut.port.suggest('photo.jpg')).ok).toBe(false)
    expect(unconfigured.dependencies.getFileSize).not.toHaveBeenCalled()
    expect(loggedOut.dependencies.getFileSize).not.toHaveBeenCalled()
  })

  it('keeps manual editing available for provider and malformed responses', async () => {
    const unavailable = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 503,
        data: '{}'
      }))
    })
    const malformed = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 200,
        data: '{"label":""}'
      }))
    })

    expect((await unavailable.port.suggest('photo.jpg')).message).toContain(
      '手工填写'
    )
    expect((await malformed.port.suggest('photo.jpg')).message).toContain(
      '手工填写'
    )
  })

  it('keeps the photo editable after the monthly quota is used', async () => {
    const harness = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 429,
        data: JSON.stringify({
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        })
      }))
    })

    const result = await harness.port.suggest('photo.jpg')

    expect(result.message).toContain('本月增强服务额度已用完')
    expect(result.message).toContain('照片仍保留')
  })
})
