import {
  importPublicBoardBundle
} from '@cboard-communication-core/publicBoardLibrary'
import type { BoardDTO } from '@cboard-communication-core/dto'

import type {
  PublicBoardLibraryPort
} from '../../platform/publicBoardLibraryPort'
import {
  detectPictureLibraryImageExtension,
  type PictureLibraryArchivePort,
  type PictureLibraryRestoreSession
} from '../../platform/pictureLibraryArchivePort'
import type { LocalDeviceDataPort } from '../../platform/localDeviceDataPort'

interface PublicBoardLibraryStore {
  load(): BoardDTO[]
  save(boards: BoardDTO[]): BoardDTO[]
}

interface PublicBoardImportOptions {
  cacheImages?: boolean
}

interface PublicBoardImageRequest {
  boardId: string
  tileId: string
  source: string
}

interface PublicBoardImageLocalization {
  boards: BoardDTO[]
  imageCount: number
  rollback(): Promise<void>
}

export const MAX_PUBLIC_BOARD_OFFLINE_IMAGE_COUNT = 200
export const MAX_PUBLIC_BOARD_OFFLINE_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_PUBLIC_BOARD_OFFLINE_TOTAL_BYTES = 20 * 1024 * 1024

class PublicBoardOfflineImportError extends Error {
  canImportOnline = true
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function collectPublicBoardImageRequests(
  bundle: unknown,
  boards: BoardDTO[]
) {
  const record = asRecord(bundle)
  const sourceBoards = record && Array.isArray(record.data) ? record.data : []
  const requests: PublicBoardImageRequest[] = []
  let unavailableCount = 0

  sourceBoards.forEach((sourceBoardValue, boardIndex) => {
    const sourceBoard = asRecord(sourceBoardValue)
    const importedBoard = boards[boardIndex]
    if (!sourceBoard || !importedBoard || !Array.isArray(sourceBoard.tiles)) {
      return
    }
    sourceBoard.tiles.forEach(sourceTileValue => {
      const sourceTile = asRecord(sourceTileValue)
      const tileId = String(sourceTile && sourceTile.id || '').trim()
      const image = String(sourceTile && sourceTile.image || '').trim()
      if (!sourceTile || !tileId || !image) return
      const source = String(sourceTile.offlineImagePath || '').trim()
      if (!/^https:\/\//i.test(source)) {
        unavailableCount += 1
        return
      }
      requests.push({ boardId: importedBoard.id, tileId, source })
    })
  })

  if (unavailableCount) {
    throw new PublicBoardOfflineImportError(
      `有 ${unavailableCount} 张图片不在 CBoard 安全代理范围内，` +
      '尚未写入本机图库。'
    )
  }
  if (requests.length > MAX_PUBLIC_BOARD_OFFLINE_IMAGE_COUNT) {
    throw new PublicBoardOfflineImportError(
      `该公共板包含 ${requests.length} 张网络图片，超过单次离线导入 ` +
      `${MAX_PUBLIC_BOARD_OFFLINE_IMAGE_COUNT} 张的安全上限。`
    )
  }
  return requests
}

function tileRequestKey(boardId: string, tileId: string) {
  return JSON.stringify([boardId, tileId])
}

async function localizePublicBoardImages(
  bundle: unknown,
  boards: BoardDTO[],
  archivePort: PictureLibraryArchivePort
): Promise<PublicBoardImageLocalization> {
  const requests = collectPublicBoardImageRequests(bundle, boards)
  if (!requests.length) {
    return { boards, imageCount: 0, rollback: async () => undefined }
  }

  let session: PictureLibraryRestoreSession | null = null
  try {
    session = await archivePort.createRestoreSession()
    const localBySource = new Map<string, string>()
    let totalBytes = 0
    let assetIndex = 0

    for (const request of requests) {
      if (localBySource.has(request.source)) continue
      const media = await archivePort.readAsset(request.source, 'image')
      const extension = detectPictureLibraryImageExtension(media.data)
      if (
        !extension ||
        !media.data.byteLength ||
        media.size !== media.data.byteLength ||
        media.data.byteLength > MAX_PUBLIC_BOARD_OFFLINE_IMAGE_BYTES ||
        totalBytes + media.data.byteLength >
          MAX_PUBLIC_BOARD_OFFLINE_TOTAL_BYTES
      ) {
        throw new TypeError('Unsupported or oversized public board image')
      }
      totalBytes += media.data.byteLength
      assetIndex += 1
      const localPath = await session.writeAsset(
        `images/cboard-public-${assetIndex}.${extension}`,
        media.data
      )
      localBySource.set(request.source, localPath)
    }

    const sourceByTile = new Map(
      requests.map(request => [
        tileRequestKey(request.boardId, request.tileId),
        request.source
      ])
    )
    return {
      boards: boards.map(board => ({
        ...board,
        tiles: board.tiles.map(tile => {
          const source = sourceByTile.get(tileRequestKey(board.id, tile.id))
          return source
            ? { ...tile, image: localBySource.get(source) || tile.image }
            : tile
        })
      })),
      imageCount: requests.length,
      rollback: () => session!.cleanup()
    }
  } catch (error) {
    if (session) await session.cleanup()
    throw new PublicBoardOfflineImportError(
      '公共板图片未能全部安全保存到本机，图库没有发生变化。'
    )
  }
}

function managedPublicBoardImagePaths(boards: BoardDTO[]) {
  return new Set(
    boards.flatMap(board =>
      board.tiles
        .map(tile => String(tile.image || '').trim())
        .filter(path =>
          /^wxfile:\/\//i.test(path) || path.includes('/picture-library/')
        )
    )
  )
}

export function createPublicBoardLibraryService(dependencies: {
  port: PublicBoardLibraryPort
  boardStore: PublicBoardLibraryStore
  archivePort: PictureLibraryArchivePort
  localDeviceDataPort: LocalDeviceDataPort
}) {
  return {
    configured: dependencies.port.configured,

    search: dependencies.port.search,

    async importBoard(id: string, options: PublicBoardImportOptions = {}) {
      let localization: PublicBoardImageLocalization | null = null
      try {
        const bundle = await dependencies.port.getBundle(id)
        const imported = importPublicBoardBundle(bundle)
        localization = options.cacheImages === false
          ? {
              boards: imported.boards,
              imageCount: 0,
              rollback: async () => undefined
            }
          : await localizePublicBoardImages(
              bundle,
              imported.boards,
              dependencies.archivePort
            )
        const importedIds = new Set(
          localization.boards.map((board: BoardDTO) => board.id)
        )
        const existing = dependencies.boardStore.load()
        const oldImportedImages = managedPublicBoardImagePaths(
          existing.filter(board => importedIds.has(board.id))
        )
        const committed = localization
        const boards = dependencies.boardStore.save([
          ...existing.filter(board => !importedIds.has(board.id)),
          ...committed.boards
        ])
        localization = null
        const retainedImages = managedPublicBoardImagePaths(boards)
        for (const path of oldImportedImages) {
          if (!retainedImages.has(path)) {
            await dependencies.localDeviceDataPort
              .removePrivateFile(path)
              .catch(() => false)
          }
        }
        return {
          ok: true,
          message:
            `已导入 ${committed.boards.length} 个公共板，共 ` +
            `${imported.diagnostics.tileCount} 张图卡。` +
            (options.cacheImages === false
              ? '图片仍使用网络链接，离线时会显示文字兜底。'
              : `其中 ${committed.imageCount} 张图片已保存到本机。`) +
            '请在板块管理中检查入口和图片授权。',
          boards,
          rootBoardId: imported.rootBoardId,
          warnings: imported.warnings,
          offlineImageCount: committed.imageCount
        }
      } catch (error) {
        if (localization) await localization.rollback()
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : '公共沟通板导入失败，请稍后重试。',
          canImportOnline: error instanceof PublicBoardOfflineImportError
        }
      }
    }
  }
}
