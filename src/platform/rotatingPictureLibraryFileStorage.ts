import type { PictureLibraryFileStorage } from './pictureLibraryStore'

export const PICTURE_LIBRARY_FILE_SLOT_KEY =
  'picinterpreter_picture_library_file_slot_v1'

type FileSlot = 'a' | 'b'

interface SyncFileSystem {
  mkdirSync(path: string, recursive?: boolean): void
  readFileSync(path: string, encoding?: 'utf8'): string | ArrayBuffer
  writeFileSync(path: string, value: string, encoding?: 'utf8'): void
  unlinkSync(path: string): void
}

interface SlotStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: string): void
  removeStorageSync(key: string): void
}

function normalizeSlot(value: unknown): FileSlot | null {
  return value === 'a' || value === 'b' ? value : null
}

function otherSlot(value: FileSlot): FileSlot {
  return value === 'a' ? 'b' : 'a'
}

export function createRotatingPictureLibraryFileStorage({
  fileSystem,
  storage,
  rootPath
}: {
  fileSystem: SyncFileSystem
  storage: SlotStorage
  rootPath: string
}): PictureLibraryFileStorage {
  const normalizedRoot = String(rootPath || '').replace(/\/+$/, '')
  if (!normalizedRoot) {
    throw new TypeError('Picture library file root is required')
  }

  const filePath = (slot: FileSlot) =>
    `${normalizedRoot}/boards-${slot}.json`

  const readSlot = (slot: FileSlot) => {
    try {
      const value = fileSystem.readFileSync(filePath(slot), 'utf8')
      const text = typeof value === 'string' ? value : ''
      if (!text) return null
      JSON.parse(text)
      return text
    } catch (error) {
      return null
    }
  }

  return {
    readCandidatesSync() {
      const active = normalizeSlot(
        storage.getStorageSync(PICTURE_LIBRARY_FILE_SLOT_KEY)
      )
      const order: FileSlot[] = active
        ? [active, otherSlot(active)]
        : ['a', 'b']
      return order.map(readSlot).filter((value): value is string => !!value)
    },

    writeSync(value: string) {
      try {
        fileSystem.mkdirSync(normalizedRoot, true)
      } catch (error) {
        // Writing below will surface a real directory failure.
      }
      const active = normalizeSlot(
        storage.getStorageSync(PICTURE_LIBRARY_FILE_SLOT_KEY)
      )
      const next = active ? otherSlot(active) : 'a'
      const nextPath = filePath(next)
      fileSystem.writeFileSync(nextPath, value, 'utf8')
      const persisted = fileSystem.readFileSync(nextPath, 'utf8')
      if (persisted !== value) {
        throw new TypeError('Picture library file verification failed')
      }
      storage.setStorageSync(PICTURE_LIBRARY_FILE_SLOT_KEY, next)
    },

    removeSync() {
      const slots: FileSlot[] = ['a', 'b']
      slots.forEach(slot => {
        try {
          fileSystem.unlinkSync(filePath(slot))
        } catch (error) {
          // Missing or already removed slots are harmless during reset.
        }
      })
      storage.removeStorageSync(PICTURE_LIBRARY_FILE_SLOT_KEY)
    }
  }
}
