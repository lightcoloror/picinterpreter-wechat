import { describe, expect, test, vi } from 'vitest'

import {
  createPictureLibraryArchivePort,
  isSafePictureLibraryAssetPath
} from './pictureLibraryArchivePort'

function createDependencies() {
  return {
    chooseFile: vi.fn().mockResolvedValue({
      name: 'library.zip',
      path: 'wxfile://library.zip'
    }),
    readBinary: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    readSourceBinary: vi.fn().mockResolvedValue(
      new Uint8Array([4, 5])
    ),
    writeArchive: vi.fn().mockResolvedValue(
      'wxfile://user/library.zip'
    ),
    shareFile: vi.fn().mockResolvedValue(undefined),
    createRestoreRoot: vi.fn().mockResolvedValue(
      'wxfile://user/picture-library/import-1'
    ),
    writeAsset: vi.fn().mockResolvedValue(
      'wxfile://user/picture-library/import-1/images/tile.png'
    ),
    removeRestoreRoot: vi.fn().mockResolvedValue(undefined)
  }
}

describe('picture library archive port', () => {
  test('reads source bytes, selects ZIP and shares a sanitized archive', async () => {
    const dependencies = createDependencies()
    const port = createPictureLibraryArchivePort(dependencies)

    await expect(
      port.readAsset('/assets/tile.png', 'image')
    ).resolves.toEqual({
      data: new Uint8Array([4, 5]),
      mediaType: 'image/png',
      size: 2
    })
    await expect(
      port.readAsset('/recordings/tile.mp3', 'sound')
    ).resolves.toEqual({
      data: new Uint8Array([4, 5]),
      mediaType: 'audio/mpeg',
      size: 2
    })
    await expect(
      port.readAsset('/videos/tile.mp4', 'video')
    ).resolves.toEqual({
      data: new Uint8Array([4, 5]),
      mediaType: 'video/mp4',
      size: 2
    })
    await expect(port.chooseArchive()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ name: 'library.zip' })
      })
    )
    expect(dependencies.chooseFile).toHaveBeenCalledWith(['zip'])
    await port.chooseArchive(['obf', 'obz'])
    expect(dependencies.chooseFile).toHaveBeenLastCalledWith(['obf', 'obz'])
    await port.shareArchive('图语家:图库.zip', new Uint8Array([1]))

    expect(dependencies.writeArchive).toHaveBeenCalledWith(
      '图语家_图库.zip',
      new Uint8Array([1])
    )
    expect(dependencies.shareFile).toHaveBeenCalled()
  })

  test('rejects path traversal before any restored file is written', async () => {
    const dependencies = createDependencies()
    const port = createPictureLibraryArchivePort(dependencies)
    const session = await port.createRestoreSession()

    expect(isSafePictureLibraryAssetPath('images/a.png')).toBe(true)
    expect(isSafePictureLibraryAssetPath('sounds/a.mp3')).toBe(true)
    expect(isSafePictureLibraryAssetPath('videos/a.mp4')).toBe(true)
    expect(isSafePictureLibraryAssetPath('../images/a.png')).toBe(false)
    await expect(
      session.writeAsset('images/../secret.png', new Uint8Array([1]))
    ).rejects.toThrow('Unsafe or empty')
    expect(dependencies.writeAsset).not.toHaveBeenCalled()

    await session.cleanup()
    expect(dependencies.removeRestoreRoot).toHaveBeenCalled()
  })
})
