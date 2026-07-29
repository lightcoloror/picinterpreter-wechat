import { describe, expect, test, vi } from 'vitest'
import type { BoardDTO } from '@cboard-communication-core/dto'

import type { PublicBoardLibraryPort } from '../../platform/publicBoardLibraryPort'
import type { PictureLibraryArchivePort } from '../../platform/pictureLibraryArchivePort'
import type { LocalDeviceDataPort } from '../../platform/localDeviceDataPort'
import { createPublicBoardLibraryService } from './publicBoardLibraryService'

const existingBoard: BoardDTO = {
  dtoType: 'BoardDTO',
  version: 1,
  id: 'existing',
  name: '本机板',
  nameKey: '',
  category: '',
  layout: { columns: 1, rows: 1, tileIds: [] },
  tiles: []
}

function bundle(options: {
  image?: string
  offlineImagePath?: string
} = {}) {
  return {
    format: 'cboard-public-board-bundle',
    contractVersion: 1,
    rootBoardId: 'root',
    source: 'cboard-public',
    sourceUrl: 'https://github.com/cboard-org/cboard',
    licenseStatus: 'unknown',
    warnings: ['请确认图片授权'],
    data: [{
      id: 'root',
      name: '公共板',
      author: '作者',
      tiles: [{
        id: 'help',
        label: '帮助',
        ...(options.image ? { image: options.image } : {}),
        ...(options.offlineImagePath
          ? { offlineImagePath: options.offlineImagePath }
          : {})
      }]
    }],
    diagnostics: {
      boardCount: 1,
      tileCount: 1,
      unavailableLinkedBoardCount: 0
    }
  }
}

function createHarness(values: {
  bundleValue?: ReturnType<typeof bundle>
  existingBoards?: BoardDTO[]
  readAsset?: PictureLibraryArchivePort['readAsset']
} = {}) {
  const save = vi.fn((boards: BoardDTO[]) => boards)
  const cleanup = vi.fn(async () => undefined)
  const writeAsset = vi.fn(async (path: string) =>
    `wxfile://usr/picture-library/session/${path}`
  )
  const port = {
    configured: true,
    search: vi.fn(),
    getBundle: vi.fn(async () => values.bundleValue || bundle())
  } as PublicBoardLibraryPort
  const archivePort = {
    readAsset: values.readAsset || vi.fn(),
    chooseArchive: vi.fn(),
    shareArchive: vi.fn(),
    createRestoreSession: vi.fn(async () => ({ writeAsset, cleanup }))
  } as unknown as PictureLibraryArchivePort
  const removePrivateFile = vi.fn(async () => true)
  const localDeviceDataPort = {
    removePrivateFile,
    clearAllLocalData: vi.fn()
  } as unknown as LocalDeviceDataPort
  const service = createPublicBoardLibraryService({
    port,
    boardStore: {
      load: () => values.existingBoards || [existingBoard],
      save
    },
    archivePort,
    localDeviceDataPort
  })
  return {
    archivePort,
    cleanup,
    localDeviceDataPort,
    port,
    removePrivateFile,
    save,
    service,
    writeAsset
  }
}

describe('publicBoardLibraryService', () => {
  test('merges a public board without images into the existing library', async () => {
    const harness = createHarness()
    const result = await harness.service.importBoard('root')

    expect(result.ok).toBe(true)
    expect(harness.save).toHaveBeenCalledWith([
      existingBoard,
      expect.objectContaining({ id: 'cboard-public-root' })
    ])
    expect(result.message).toContain('1 个公共板')
    expect(result.message).toContain('0 张图片已保存到本机')
  })

  test('downloads, validates, and atomically stores public board images', async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])
    const readAsset = vi.fn(async () => ({
      data: png,
      mediaType: 'image/png',
      size: png.byteLength
    }))
    const harness = createHarness({
      bundleValue: bundle({
        image: 'https://cdn.example.test/help.png',
        offlineImagePath:
          'https://api.example.test/board/public/root/tile/help/image'
      }),
      readAsset
    })

    const result = await harness.service.importBoard('root')

    expect(result.ok).toBe(true)
    expect(result.offlineImageCount).toBe(1)
    expect(readAsset).toHaveBeenCalledWith(
      'https://api.example.test/board/public/root/tile/help/image',
      'image'
    )
    expect(harness.writeAsset).toHaveBeenCalledWith(
      'images/cboard-public-1.png',
      png
    )
    expect(harness.save.mock.calls[0][0][1].tiles[0].image).toBe(
      'wxfile://usr/picture-library/session/images/cboard-public-1.png'
    )
    expect(harness.cleanup).not.toHaveBeenCalled()
  })

  test('rolls back all staged images when one image cannot be saved', async () => {
    const harness = createHarness({
      bundleValue: bundle({
        image: 'https://external.example.test/help.png',
        offlineImagePath:
          'https://api.example.test/board/public/root/tile/help/image'
      }),
      readAsset: vi.fn(async () => {
        throw new Error('download failed')
      })
    })

    await expect(harness.service.importBoard('root')).resolves.toEqual({
      ok: false,
      message: '公共板图片未能全部安全保存到本机，图库没有发生变化。',
      canImportOnline: true
    })
    expect(harness.cleanup).toHaveBeenCalledTimes(1)
    expect(harness.save).not.toHaveBeenCalled()
  })

  test('imports network links only after the caregiver chooses fallback', async () => {
    const harness = createHarness({
      bundleValue: bundle({
        image: 'https://external.example.test/help.png'
      })
    })

    const result = await harness.service.importBoard('root', {
      cacheImages: false
    })

    expect(result.ok).toBe(true)
    expect(result.message).toContain('图片仍使用网络链接')
    expect(harness.archivePort.createRestoreSession).not.toHaveBeenCalled()
    expect(harness.save.mock.calls[0][0][1].tiles[0].image).toBe(
      'https://external.example.test/help.png'
    )
  })

  test('removes the superseded local image only after re-import commits', async () => {
    const previousPublicBoard: BoardDTO = {
      ...existingBoard,
      id: 'cboard-public-root',
      name: '旧公共板',
      layout: { columns: 1, rows: 1, tileIds: ['help'] },
      tiles: [{
        dtoType: 'TileDTO',
        version: 1,
        id: 'help',
        boardId: 'cboard-public-root',
        label: '帮助',
        vocalization: '帮助',
        image:
          'wxfile://usr/picture-library/old/images/cboard-public-1.png',
        sound: '',
        backgroundColor: '',
        keyPath: '',
        loadBoardId: '',
        communication: {
          synonyms: [],
          relatedTerms: [],
          excludeTokens: [],
          category: ''
        }
      }]
    }
    const harness = createHarness({
      bundleValue: bundle({
        image: 'https://external.example.test/help.png'
      }),
      existingBoards: [existingBoard, previousPublicBoard]
    })

    const result = await harness.service.importBoard('root', {
      cacheImages: false
    })

    expect(result.ok).toBe(true)
    expect(harness.removePrivateFile).toHaveBeenCalledWith(
      'wxfile://usr/picture-library/old/images/cboard-public-1.png'
    )
  })

  test('returns a caregiver-facing API error without changing local data', async () => {
    const harness = createHarness()
    harness.port.getBundle = vi.fn(async () => {
      throw new Error('公共沟通板已下架')
    })

    await expect(harness.service.importBoard('missing')).resolves.toEqual({
      ok: false,
      message: '公共沟通板已下架',
      canImportOnline: false
    })
    expect(harness.save).not.toHaveBeenCalled()
  })
})
