import { describe, expect, test, vi } from 'vitest'

import {
  COMMUNICATION_AAC_IMPORT_MAX_BYTES,
  createCommunicationAacImportPort
} from './communicationAacImportPort'

function createHarness() {
  const uploadFile = vi.fn(async () => ({
    statusCode: 200,
    data: {
      format: 'picinterpreter-aac-conversion',
      contractVersion: 1,
      sourceFormat: 'snap',
      warnings: [],
      documents: [
        {
          path: 'boards/home.obf',
          board: { format: 'open-board-0.1', id: 'home' }
        }
      ]
    }
  }))
  return {
    uploadFile,
    port: createCommunicationAacImportPort({
      apiBaseUrl: 'https://api.example.test/',
      getAuthToken: () => 'token',
      uploadFile
    })
  }
}

describe('communication AAC import port', () => {
  test('uploads Snap with auth and validates the conversion contract', async () => {
    const harness = createHarness()
    const result = await harness.port.convert({
      name: 'patient.sps',
      data: new Uint8Array([1, 2, 3]),
      locale: 'zh-CN'
    })

    expect(result.ok).toBe(true)
    expect(result.value?.documents).toHaveLength(1)
    expect(harness.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://api.example.test/communication/aac-import/convert?format=snap&locale=zh-CN',
        header: { Authorization: 'Bearer token' }
      })
    )
  })

  test('requires configuration, login, supported extension, and bounded input', async () => {
    const unconfigured = createCommunicationAacImportPort({
      apiBaseUrl: '',
      getAuthToken: () => '',
      uploadFile: vi.fn()
    })
    expect(
      (await unconfigured.convert({ name: 'file.sps', data: new Uint8Array([1]) })).ok
    ).toBe(false)

    const anonymous = createCommunicationAacImportPort({
      apiBaseUrl: 'https://api.example.test',
      getAuthToken: () => '',
      uploadFile: vi.fn()
    })
    expect(
      (await anonymous.convert({ name: 'file.sps', data: new Uint8Array([1]) })).message
    ).toContain('登录')

    const harness = createHarness()
    expect(
      (await harness.port.convert({ name: 'file.gridset', data: new Uint8Array([1]) })).ok
    ).toBe(false)
    expect(
      (
        await harness.port.convert({
          name: 'file.ce',
          data: new Uint8Array(COMMUNICATION_AAC_IMPORT_MAX_BYTES + 1)
        })
      ).ok
    ).toBe(false)
    expect(harness.uploadFile).not.toHaveBeenCalled()
  })

  test('rejects a mismatched or malformed server response', async () => {
    const harness = createHarness()
    harness.uploadFile.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        format: 'picinterpreter-aac-conversion',
        contractVersion: 1,
        sourceFormat: 'touchchat',
        documents: []
      }
    })

    const result = await harness.port.convert({
      name: 'file.sps',
      data: new Uint8Array([1])
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('响应格式无效')
  })
})
