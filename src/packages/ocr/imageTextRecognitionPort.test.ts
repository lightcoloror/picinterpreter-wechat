import { describe, expect, test, vi } from 'vitest'

import { createImageTextRecognitionPort } from './imageTextRecognitionPort'

function createHarness(
  overrides: Partial<Parameters<typeof createImageTextRecognitionPort>[0]> = {}
) {
  const dependencies: Parameters<typeof createImageTextRecognitionPort>[0] = {
    apiBaseUrl: 'https://api.example.test',
    getAuthToken: () => 'token',
    chooseImage: vi.fn(async () => ({
      tempFilePath: 'wxfile://temp/notice.png',
      size: 1200
    })),
    compressImage: vi.fn(async () => ({
      tempFilePath: 'wxfile://temp/notice-compressed.jpg'
    })),
    getFileSize: vi.fn(async () => 1200),
    uploadFile: vi.fn(async () => ({
      statusCode: 200,
      data: JSON.stringify({
        text: ' 我想\n喝水 ',
        provider: 'cboard-api-ai',
        sourceStored: false
      })
    })),
    ...overrides
  }
  return {
    dependencies,
    port: createImageTextRecognitionPort(dependencies)
  }
}

describe('imageTextRecognitionPort', () => {
  test('uploads one authenticated image and normalizes editable text', async () => {
    const { dependencies, port } = createHarness()

    await expect(port.selectAndRecognize()).resolves.toEqual({
      ok: true,
      message: '识别完成，文字仍可人工修改。',
      value: {
        text: '我想 喝水',
        provider: 'cboard-api-ai',
        sourceStored: false
      }
    })
    expect(dependencies.uploadFile).toHaveBeenCalledWith({
      url: 'https://api.example.test/gpt/communication/ocr',
      filePath: 'wxfile://temp/notice.png',
      name: 'image',
      header: { Authorization: 'Bearer token' }
    })
  })

  test('compresses an oversized image once before upload', async () => {
    const { dependencies, port } = createHarness({
      chooseImage: vi.fn(async () => ({
        tempFilePath: 'wxfile://temp/large.jpg',
        size: 3 * 1024 * 1024
      })),
      getFileSize: vi.fn(async () => 900 * 1024)
    })

    expect((await port.selectAndRecognize()).ok).toBe(true)
    expect(dependencies.compressImage).toHaveBeenCalledTimes(1)
    expect(dependencies.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'wxfile://temp/notice-compressed.jpg'
      })
    )
  })

  test('never opens the picker before API configuration and login checks pass', async () => {
    const unconfigured = createHarness({ apiBaseUrl: '' })
    const loggedOut = createHarness({ getAuthToken: () => '' })

    expect((await unconfigured.port.selectAndRecognize()).message).toContain(
      '尚未配置'
    )
    expect((await loggedOut.port.selectAndRecognize()).message).toContain(
      '登录'
    )
    expect(unconfigured.dependencies.chooseImage).not.toHaveBeenCalled()
    expect(loggedOut.dependencies.chooseImage).not.toHaveBeenCalled()
  })

  test('rejects an image that remains above 2 MiB after compression', async () => {
    const { dependencies, port } = createHarness({
      chooseImage: vi.fn(async () => ({
        tempFilePath: 'wxfile://temp/large.jpg',
        size: 3 * 1024 * 1024
      })),
      getFileSize: vi.fn(async () => 2 * 1024 * 1024 + 1)
    })

    expect((await port.selectAndRecognize()).message).toContain('2 MiB')
    expect(dependencies.uploadFile).not.toHaveBeenCalled()
  })

  test('keeps manual input available after the monthly quota is used', async () => {
    const { port } = createHarness({
      uploadFile: vi.fn(async () => ({
        statusCode: 429,
        data: JSON.stringify({
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        })
      }))
    })

    const result = await port.selectAndRecognize()

    expect(result.message).toContain('本月增强服务额度已用完')
    expect(result.message).toContain('手工输入')
  })
})
