import { describe, expect, test, vi } from 'vitest'

import { createCommunicationFilePort } from './communicationFilePort'

describe('communication file port', () => {
  test('writes and opens a sanitized UTF-8 export', async () => {
    const writeText = vi.fn().mockResolvedValue('wxfile://saved/phrases.json')
    const openFile = vi.fn().mockResolvedValue(undefined)
    const port = createCommunicationFilePort({
      chooseFile: vi.fn(),
      readText: vi.fn(),
      writeText,
      openFile
    })

    const result = await port.exportText('图语家:常用语.json', '{"version":1}')

    expect(result.ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('图语家_常用语.json', '{"version":1}')
    expect(openFile).toHaveBeenCalledWith('wxfile://saved/phrases.json')
  })

  test('reads a selected JSON file and handles cancellation', async () => {
    const selected = createCommunicationFilePort({
      chooseFile: vi.fn().mockResolvedValue({
        name: 'phrases.json',
        path: 'wxfile://temp/phrases.json'
      }),
      readText: vi.fn().mockResolvedValue('{"version":1}'),
      writeText: vi.fn(),
      openFile: vi.fn()
    })
    const cancelled = createCommunicationFilePort({
      chooseFile: vi.fn().mockResolvedValue(null),
      readText: vi.fn(),
      writeText: vi.fn(),
      openFile: vi.fn()
    })

    await expect(selected.importText()).resolves.toEqual(expect.objectContaining({
      ok: true,
      value: '{"version":1}'
    }))
    await expect(cancelled.importText()).resolves.toEqual(expect.objectContaining({
      ok: false,
      message: '未选择文件。'
    }))
  })
})
