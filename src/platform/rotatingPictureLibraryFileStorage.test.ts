import { describe, expect, test } from 'vitest'

import {
  PICTURE_LIBRARY_FILE_SLOT_KEY,
  createRotatingPictureLibraryFileStorage
} from './rotatingPictureLibraryFileStorage'

function createHarness() {
  const files = new Map<string, string>()
  const storage = new Map<string, unknown>()
  const fileStorage = createRotatingPictureLibraryFileStorage({
    rootPath: 'wxfile://user/picture-library',
    fileSystem: {
      mkdirSync: () => undefined,
      readFileSync: path => {
        if (!files.has(path)) throw new Error('not found')
        return files.get(path)!
      },
      writeFileSync: (path, value) => files.set(path, value),
      unlinkSync: path => {
        if (!files.delete(path)) throw new Error('not found')
      }
    },
    storage: {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key)
    }
  })
  return { fileStorage, files, storage }
}

describe('rotating picture library file storage', () => {
  test('writes to the inactive slot and keeps the previous valid snapshot', () => {
    const harness = createHarness()

    harness.fileStorage.writeSync('[{"id":"first"}]')
    harness.fileStorage.writeSync('[{"id":"second"}]')

    expect(harness.storage.get(PICTURE_LIBRARY_FILE_SLOT_KEY)).toBe('b')
    expect(harness.fileStorage.readCandidatesSync()).toEqual([
      '[{"id":"second"}]',
      '[{"id":"first"}]'
    ])
  })

  test('falls back to the previous slot when the active file is corrupted', () => {
    const harness = createHarness()
    harness.fileStorage.writeSync('[{"id":"first"}]')
    harness.fileStorage.writeSync('[{"id":"second"}]')
    harness.files.set(
      'wxfile://user/picture-library/boards-b.json',
      '{broken'
    )

    expect(harness.fileStorage.readCandidatesSync()).toEqual([
      '[{"id":"first"}]'
    ])
  })

  test('removes both snapshots and the active marker', () => {
    const harness = createHarness()
    harness.fileStorage.writeSync('[{"id":"first"}]')
    harness.fileStorage.writeSync('[{"id":"second"}]')

    harness.fileStorage.removeSync()

    expect(harness.files.size).toBe(0)
    expect(harness.storage.has(PICTURE_LIBRARY_FILE_SLOT_KEY)).toBe(false)
  })
})
