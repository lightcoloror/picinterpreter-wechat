import { describe, expect, test } from 'vitest'
import type { BoardDTO } from '@cboard-communication-core/dto'
import { createPictogramLibraryDTO } from '@cboard-communication-core/pictogramLibrary'

import {
  PICTURE_LIBRARY_STORAGE_KEY,
  createPictureLibraryStore
} from './pictureLibraryStore'

function createBoard(id: string, name = id): BoardDTO {
  return {
    dtoType: 'BoardDTO',
    version: 1,
    id,
    name,
    nameKey: '',
    category: '',
    layout: { columns: 1, rows: 1, tileIds: ['tile'] },
    tiles: [
      {
        dtoType: 'TileDTO',
        version: 1,
        id: 'tile',
        boardId: id,
        label: '图卡',
        vocalization: '图卡',
        image: 'wxfile://tile.png',
        backgroundColor: '',
        keyPath: '',
        loadBoardId: '',
        communication: {
          synonyms: [],
          relatedTerms: [],
          excludeTokens: [],
          category: ''
        }
      }
    ]
  }
}

describe('picture library store', () => {
  test('falls back safely and restores a normalized full library', () => {
    const values = new Map<string, unknown>()
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      [createBoard('default')]
    )

    expect(store.load()[0].id).toBe('default')
    expect(store.save([createBoard('restored', '已恢复')])[0]).toEqual(
      expect.objectContaining({ id: 'restored', name: '已恢复' })
    )
    expect(
      JSON.parse(String(values.get(PICTURE_LIBRARY_STORAGE_KEY)))
    ).toHaveLength(1)
    expect(store.load()[0].id).toBe('restored')
    expect(store.reset()[0].id).toBe('default')
  })

  test('rejects an empty replacement instead of erasing the working library', () => {
    const store = createPictureLibraryStore(
      {
        getStorageSync: () => null,
        setStorageSync: () => undefined,
        removeStorageSync: () => undefined
      },
      [createBoard('default')]
    )

    expect(() => store.save([])).toThrow(
      'Picture library must contain at least one board'
    )
  })

  test('loads the shared structured pictogram library contract', () => {
    const values = new Map<string, unknown>()
    const sourceBoard = createBoard('structured', '结构化图库')
    sourceBoard.tiles[0].communication.synonyms = ['图片卡']
    const library = createPictogramLibraryDTO([sourceBoard], {
      locale: 'zh-CN'
    })
    values.set(PICTURE_LIBRARY_STORAGE_KEY, JSON.stringify(library))
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      [createBoard('default')]
    )

    const [restored] = store.load()
    expect(restored).toEqual(
      expect.objectContaining({
        id: 'structured',
        name: '结构化图库'
      })
    )
    expect(restored.tiles[0]).toEqual(
      expect.objectContaining({
        label: '图卡',
        image: 'wxfile://tile.png',
        communication: expect.objectContaining({
          synonyms: ['图片卡']
        })
      })
    )
  })

  test('prefers the file-backed library and migrates legacy storage safely', () => {
    const values = new Map<string, unknown>()
    const fileCandidates: unknown[] = []
    const writes: string[] = []
    values.set(
      PICTURE_LIBRARY_STORAGE_KEY,
      JSON.stringify([createBoard('legacy')])
    )
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      [createBoard('default')],
      {
        readCandidatesSync: () => fileCandidates,
        writeSync: value => {
          writes.push(value)
          fileCandidates.unshift(value)
        },
        removeSync: () => {
          fileCandidates.length = 0
        }
      }
    )

    expect(store.load()[0].id).toBe('legacy')
    expect(writes).toHaveLength(1)
    expect(values.has(PICTURE_LIBRARY_STORAGE_KEY)).toBe(false)

    values.set(
      PICTURE_LIBRARY_STORAGE_KEY,
      JSON.stringify([createBoard('stale-storage')])
    )
    expect(store.load()[0].id).toBe('legacy')
  })

  test('falls back to legacy storage if the file API cannot save', () => {
    const values = new Map<string, unknown>()
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      [createBoard('default')],
      {
        readCandidatesSync: () => [],
        writeSync: () => {
          throw new Error('file API unavailable')
        },
        removeSync: () => undefined
      }
    )

    store.save([createBoard('storage-fallback')])

    expect(
      JSON.parse(String(values.get(PICTURE_LIBRARY_STORAGE_KEY)))[0].id
    ).toBe('storage-fallback')
  })
})
