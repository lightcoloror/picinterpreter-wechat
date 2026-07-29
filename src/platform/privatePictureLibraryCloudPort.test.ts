import { describe, expect, test, vi } from 'vitest'

import {
  PRIVATE_PICTURE_LIBRARY_MAX_BYTES,
  createPrivateDeviceDataCloudPort,
  createPrivatePictureLibraryCloudPort
} from './privatePictureLibraryCloudPort'

const metadata = {
  format: 'picinterpreter-private-picture-library-encrypted' as const,
  contractVersion: 2 as const,
  size: 9,
  sha256: 'a'.repeat(64),
  createdAt: 10,
  updatedAt: 20
}

const deviceMetadata = {
  ...metadata,
  format: 'picinterpreter-private-device-data-encrypted' as const,
  contractVersion: 2 as const
}

const encryptedArchive = new Uint8Array([
  0x50,
  0x49,
  0x45,
  0x32,
  0x45,
  0x45,
  0x30,
  0x31,
  1
])

function createHarness() {
  const dependencies = {
    apiBaseUrl: 'https://api.example.test/',
    getAuthToken: vi.fn(() => 'token-1'),
    request: vi.fn(async () => ({ statusCode: 200, data: metadata })),
    uploadArchive: vi.fn(async () => ({ statusCode: 200, data: metadata })),
    downloadArchive: vi.fn(async () => ({
      statusCode: 200,
      data: encryptedArchive
    }))
  }
  return {
    dependencies,
    port: createPrivatePictureLibraryCloudPort(dependencies)
  }
}

describe('private picture library cloud port', () => {
  test('uploads encrypted private pictures with the authenticated API contract', async () => {
    const { dependencies, port } = createHarness()
    const data = encryptedArchive

    await expect(port.upload(data)).resolves.toEqual(
      expect.objectContaining({ ok: true, value: metadata })
    )
    expect(dependencies.uploadArchive).toHaveBeenCalledWith({
      url: 'https://api.example.test/communication/private-library',
      data,
      fileName: 'picinterpreter-private-picture-library.pijenc',
      fieldName: 'file',
      header: { Authorization: 'Bearer token-1' }
    })
  })

  test('does not claim that cloud data is unchanged after an uncertain upload response', async () => {
    const { dependencies, port } = createHarness()
    dependencies.uploadArchive.mockRejectedValueOnce(
      new TypeError('simulated response loss')
    )

    await expect(port.upload(encryptedArchive)).resolves.toEqual({
      ok: false,
      message:
        '上传响应未确认，本机图片没有改变；云端备份可能已经更新。请先使用“下载、复核并恢复”核对，再决定是否重试。'
    })
  })

  test('downloads only a bounded encrypted archive for local decryption', async () => {
    const { dependencies, port } = createHarness()

    await expect(port.download()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          name: 'picinterpreter-private-picture-library.pijenc',
          data: encryptedArchive
        })
      })
    )
    expect(dependencies.downloadArchive).toHaveBeenCalledWith({
      url:
        'https://api.example.test/communication/private-library/download',
      header: { Authorization: 'Bearer token-1' }
    })
  })

  test('rejects plaintext picture ZIPs and explains legacy migration', async () => {
    const { dependencies, port } = createHarness()
    const plaintextZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])

    expect((await port.upload(plaintextZip)).ok).toBe(false)
    dependencies.request.mockResolvedValueOnce({ statusCode: 409, data: {} })
    await expect(port.getMetadata()).resolves.toEqual({
      ok: false,
      message:
        '该云端备份是旧版明文格式。请在原设备设置恢复密码并重新上传后再恢复。'
    })
  })

  test('reuses the cloud contract for complete private device data', async () => {
    const { dependencies } = createHarness()
    dependencies.uploadArchive.mockResolvedValue({
      statusCode: 200,
      data: deviceMetadata
    })
    dependencies.downloadArchive.mockResolvedValue({
      statusCode: 200,
      data: encryptedArchive
    })
    const port = createPrivateDeviceDataCloudPort(dependencies)
    const data = encryptedArchive

    await expect(port.upload(data)).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        message: '完整私有数据已备份到当前 CBoard 账号。'
      })
    )
    expect(dependencies.uploadArchive).toHaveBeenCalledWith({
      url: 'https://api.example.test/communication/private-device-data',
      data,
      fileName: 'picinterpreter-private-device-data.pijenc',
      fieldName: 'file',
      header: { Authorization: 'Bearer token-1' }
    })

    await port.download()
    expect(dependencies.downloadArchive).toHaveBeenCalledWith({
      url:
        'https://api.example.test/communication/private-device-data/download',
      header: { Authorization: 'Bearer token-1' }
    })
    await expect(port.download()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: {
          name: 'picinterpreter-private-device-data.pijenc',
          data: encryptedArchive
        }
      })
    )
  })

  test('rejects plaintext complete data and explains legacy migration', async () => {
    const { dependencies } = createHarness()
    const port = createPrivateDeviceDataCloudPort(dependencies)

    expect(
      (await port.upload(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]))).ok
    ).toBe(false)
    dependencies.downloadArchive.mockResolvedValueOnce({ statusCode: 409 })
    await expect(port.download()).resolves.toEqual({
      ok: false,
      message:
        '该云端备份是旧版明文格式。请在原设备设置恢复密码并重新上传后再恢复。'
    })
  })

  test('reads metadata and deletes without exposing a blob URL', async () => {
    const { dependencies, port } = createHarness()

    await expect(port.getMetadata()).resolves.toEqual(
      expect.objectContaining({ ok: true, value: metadata })
    )
    dependencies.request.mockResolvedValueOnce({
      statusCode: 200,
      data: { deleted: true }
    })
    await expect(port.delete()).resolves.toEqual({
      ok: true,
      message: '云端私人图片备份已删除，本机图片仍保留。',
      value: { deleted: true }
    })
  })

  test('requires configuration and a login before network access', async () => {
    const { dependencies } = createHarness()
    const unconfigured = createPrivatePictureLibraryCloudPort({
      ...dependencies,
      apiBaseUrl: ''
    })
    const loggedOut = createPrivatePictureLibraryCloudPort({
      ...dependencies,
      getAuthToken: () => ''
    })

    expect((await unconfigured.download()).ok).toBe(false)
    expect((await loggedOut.upload(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    )).message).toContain('请先登录')
    expect(dependencies.downloadArchive).not.toHaveBeenCalled()
    expect(dependencies.uploadArchive).not.toHaveBeenCalled()
  })

  test('rejects invalid, oversized and malformed server payloads', async () => {
    const { dependencies, port } = createHarness()

    expect((await port.upload(new Uint8Array([1, 2, 3]))).ok).toBe(false)
    const oversized = new Uint8Array(PRIVATE_PICTURE_LIBRARY_MAX_BYTES + 1)
    oversized.set([0x50, 0x49, 0x45, 0x32, 0x45, 0x45, 0x30, 0x31])
    expect((await port.upload(oversized)).ok).toBe(false)

    dependencies.request.mockResolvedValueOnce({
      statusCode: 200,
      data: { ...metadata, sha256: 'not-a-hash' }
    })
    expect((await port.getMetadata()).ok).toBe(false)
  })

  test('explains when the account private storage is not configured', async () => {
    const { dependencies, port } = createHarness()
    dependencies.request.mockResolvedValueOnce({
      statusCode: 503,
      data: {
        message: 'Private picture library storage is not configured'
      }
    })

    await expect(port.getMetadata()).resolves.toEqual({
      ok: false,
      message: '服务器尚未配置账号私人图片存储，本机 ZIP 备份仍可正常使用。'
    })
  })
})
