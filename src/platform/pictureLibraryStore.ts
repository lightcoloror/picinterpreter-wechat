import {
  createBoardDTO,
  type BoardDTO
} from '@cboard-communication-core/dto'
import {
  isPictogramLibraryDTO,
  pictogramLibraryDTOToBoards,
  type PictogramLibraryDTO
} from '@cboard-communication-core/pictogramLibrary'

export const PICTURE_LIBRARY_STORAGE_KEY =
  'picinterpreter_picture_library_boards_v1'

interface PictureLibraryStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: string): void
  removeStorageSync(key: string): void
}

export interface PictureLibraryFileStorage {
  readCandidatesSync(): unknown[]
  writeSync(value: string): void
  removeSync(): void
}

function normalizeBoards(value: unknown): BoardDTO[] {
  const source = isPictogramLibraryDTO(value)
    ? pictogramLibraryDTOToBoards(value)
    : value
  if (!Array.isArray(source)) return []
  const seen = new Set<string>()
  return source
    .map(item => {
      try {
        return createBoardDTO(item)
      } catch (error) {
        return null
      }
    })
    .filter((board): board is BoardDTO => {
      if (!board || !board.id || seen.has(board.id)) return false
      seen.add(board.id)
      return true
    })
    .slice(0, 500)
}

export function createPictureLibraryStore(
  storage: PictureLibraryStorage,
  fallbackBoards: BoardDTO[],
  fileStorage?: PictureLibraryFileStorage
) {
  const fallback = normalizeBoards(fallbackBoards)

  const readBoards = (raw: unknown) => {
    if (!raw) return []
    try {
      return normalizeBoards(typeof raw === 'string' ? JSON.parse(raw) : raw)
    } catch (error) {
      return []
    }
  }

  const load = () => {
    if (fileStorage) {
      try {
        for (const candidate of fileStorage.readCandidatesSync()) {
          const boards = readBoards(candidate)
          if (boards.length) return boards
        }
      } catch (error) {
        // Legacy storage remains the safe fallback when the file API fails.
      }
    }

    const raw = storage.getStorageSync(PICTURE_LIBRARY_STORAGE_KEY)
    const boards = readBoards(raw)
    if (!boards.length) return fallback
    if (fileStorage) {
      try {
        fileStorage.writeSync(JSON.stringify(boards))
        storage.removeStorageSync(PICTURE_LIBRARY_STORAGE_KEY)
      } catch (error) {
        // Keep the legacy value until file migration succeeds.
      }
    }
    return boards
  }

  const save = (value: BoardDTO[] | PictogramLibraryDTO) => {
    const boards = normalizeBoards(value)
    if (!boards.length) {
      throw new TypeError('Picture library must contain at least one board')
    }
    const serialized = JSON.stringify(boards)
    if (fileStorage) {
      try {
        fileStorage.writeSync(serialized)
        storage.removeStorageSync(PICTURE_LIBRARY_STORAGE_KEY)
        return boards
      } catch (error) {
        // Preserve compatibility on platforms where the file API is absent.
      }
    }
    storage.setStorageSync(PICTURE_LIBRARY_STORAGE_KEY, serialized)
    return boards
  }

  return {
    load,
    save,
    reset() {
      if (fileStorage) {
        try {
          fileStorage.removeSync()
        } catch (error) {
          // Storage cleanup still proceeds if a stale file cannot be removed.
        }
      }
      storage.removeStorageSync(PICTURE_LIBRARY_STORAGE_KEY)
      return fallback
    }
  }
}
