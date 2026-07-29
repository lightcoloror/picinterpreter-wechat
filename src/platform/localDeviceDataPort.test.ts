import { describe, expect, test, vi } from 'vitest'

import {
  createLocalDeviceDataPort,
  isGeneratedLocalDataFileName
} from './localDeviceDataPort'

describe('local device data port', () => {
  test('recognizes every current generated backup and text export', () => {
    expect(
      [
        'picinterpreter-local-device-data-20260719.zip',
        'picinterpreter-picture-library-full-20260719.zip',
        'picinterpreter-tts-current.mp3',
        '图语家_对话记录_123.txt',
        '图语家_常用语_2026-07-19.json'
      ].every(isGeneratedLocalDataFileName)
    ).toBe(true)
    expect(isGeneratedLocalDataFileName('family-photo.png')).toBe(false)
  })

  test('deduplicates files and clears storage only after files are removed', async () => {
    const removeFile = vi.fn(async () => undefined)
    const clearStorage = vi.fn(async () => undefined)
    const port = createLocalDeviceDataPort({
      removeFile,
      listSavedFiles: async () => ['saved.png', 'backup.zip'],
      listGeneratedFiles: async () => ['backup.zip'],
      removePictureLibraryRoot: vi.fn(async () => undefined),
      clearStorage
    })

    expect(await port.clearAllLocalData()).toEqual(
      expect.objectContaining({ ok: true })
    )
    expect(removeFile.mock.calls.map(call => call[0])).toEqual([
      'saved.png',
      'backup.zip'
    ])
    expect(clearStorage).toHaveBeenCalledTimes(1)
  })

  test('does not claim success or clear storage after a file failure', async () => {
    const clearStorage = vi.fn(async () => undefined)
    const port = createLocalDeviceDataPort({
      removeFile: vi.fn(async () => {
        throw new Error('locked')
      }),
      listSavedFiles: async () => ['private.png'],
      listGeneratedFiles: async () => [],
      removePictureLibraryRoot: vi.fn(async () => undefined),
      clearStorage
    })

    expect(await port.clearAllLocalData()).toEqual(
      expect.objectContaining({ ok: false })
    )
    expect(clearStorage).not.toHaveBeenCalled()
  })
})
