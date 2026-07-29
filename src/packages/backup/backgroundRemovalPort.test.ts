import { describe, expect, it, vi } from 'vitest'

import { createBackgroundRemovalPort } from './backgroundRemovalPort'

const transparentPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xz9WAAAAAElFTkSuQmCC'

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
        imageBase64: transparentPng,
        mimeType: 'image/png',
        width: 1,
        height: 1,
        provider: 'rembg',
        sourceStored: false,
        originalRetained: true
      })
    })),
    saveBase64Png: vi.fn(async () =>
      'wxfile://usr/picinterpreter-background.png'
    ),
    ...overrides
  }
  return {
    dependencies,
    port: createBackgroundRemovalPort(dependencies)
  }
}

describe('background removal port', () => {
  it('uploads an authenticated image and saves a reviewed transparent PNG', async () => {
    const harness = createHarness()

    await expect(
      harness.port.removeBackground('wxfile://saved/cup.jpg')
    ).resolves.toEqual({
      ok: true,
      message: '透明背景已应用；保存前可一键恢复原图。',
      image: 'wxfile://usr/picinterpreter-background.png',
      provider: 'rembg'
    })
    expect(harness.dependencies.uploadFile).toHaveBeenCalledWith({
      url:
        'https://api.example.test/gpt/communication/background-removal',
      filePath: 'wxfile://saved/cup.jpg',
      name: 'image',
      header: { Authorization: 'Bearer token' }
    })
    expect(harness.dependencies.saveBase64Png).toHaveBeenCalledWith(
      transparentPng
    )
  })

  it('compresses once before upload when the source exceeds 2 MiB', async () => {
    const harness = createHarness({
      getFileSize: vi
        .fn()
        .mockResolvedValueOnce(3 * 1024 * 1024)
        .mockResolvedValueOnce(900 * 1024)
    })

    const result =
      await harness.port.removeBackground('wxfile://large.jpg')

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

    expect(
      (await unconfigured.port.removeBackground('photo.jpg')).ok
    ).toBe(false)
    expect(
      (await loggedOut.port.removeBackground('photo.jpg')).ok
    ).toBe(false)
    expect(unconfigured.dependencies.getFileSize).not.toHaveBeenCalled()
    expect(loggedOut.dependencies.getFileSize).not.toHaveBeenCalled()
  })

  it('rejects responses that weaken privacy or transparency guarantees', async () => {
    const stored = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 200,
        data: JSON.stringify({
          imageBase64: transparentPng,
          mimeType: 'image/png',
          width: 1,
          height: 1,
          provider: 'rembg',
          sourceStored: true,
          originalRetained: true
        })
      }))
    })
    const opaque = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 200,
        data: JSON.stringify({
          imageBase64: 'QUJDRA==',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          provider: 'rembg',
          sourceStored: false,
          originalRetained: true
        })
      }))
    })

    expect(
      (await stored.port.removeBackground('photo.jpg')).ok
    ).toBe(false)
    expect(
      (await opaque.port.removeBackground('photo.jpg')).ok
    ).toBe(false)
    expect(stored.dependencies.saveBase64Png).not.toHaveBeenCalled()
    expect(opaque.dependencies.saveBase64Png).not.toHaveBeenCalled()
  })

  it('keeps the original usable when the provider is unavailable', async () => {
    const harness = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 503,
        data: '{}'
      }))
    })

    const result =
      await harness.port.removeBackground('wxfile://saved/cup.jpg')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('原图仍保留')
    expect(harness.dependencies.saveBase64Png).not.toHaveBeenCalled()
  })

  it('keeps the original usable after the monthly quota is used', async () => {
    const harness = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 429,
        data: JSON.stringify({
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        })
      }))
    })

    const result =
      await harness.port.removeBackground('wxfile://saved/cup.jpg')

    expect(result.message).toContain('本月增强服务额度已用完')
    expect(result.message).toContain('原图仍保留')
    expect(harness.dependencies.saveBase64Png).not.toHaveBeenCalled()
  })
})
