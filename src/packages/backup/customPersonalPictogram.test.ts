import { describe, expect, it } from 'vitest'
import {
  createBoardDTO,
  type BoardDTO
} from '@cboard-communication-core/dto'
import { searchExpressionPictograms } from '@cboard-communication-core/expressionPictogramSearch'

import {
  PICTURE_LIBRARY_STORAGE_KEY,
  createPictureLibraryStore
} from '../../platform/pictureLibraryStore'
import {
  copyCustomPersonalPictogram,
  createCustomPersonalPictogram,
  isCustomPictogramMediaReferencedElsewhere,
  listCustomPersonalPictograms,
  moveCustomPersonalPictogram,
  removeCustomPersonalPictogram,
  updateCustomPersonalPictogram
} from './customPersonalPictogram'

function createBoards(): BoardDTO[] {
  return [
    createBoardDTO({
      id: 'food',
      name: '饮食',
      tiles: [{ id: 'water', label: '水' }]
    })
  ]
}

describe('custom personal pictograms', () => {
  it('adds a private attributed tile to an existing CBoard board', () => {
    const result = createCustomPersonalPictogram(createBoards(), {
      id: 'device_private_custom_1',
      boardId: 'food',
      image: 'wxfile://saved/apple.jpg',
      mediaType: 'video',
      video: 'wxfile://saved/apple-action.mp4',
      sound: 'wxfile://saved/apple.mp3',
      label: '苹果',
      vocalization: '我要苹果',
      synonyms: '水果',
      category: '饮食'
    })

    expect(result.tile.pictogramAttribution?.provider).toBe(
      'device-private'
    )
    expect(result.tile.sound).toBe('wxfile://saved/apple.mp3')
    expect(result.boards[0].tiles.map(tile => tile.label)).toEqual([
      '水',
      '苹果'
    ])
    expect(listCustomPersonalPictograms(result.boards)).toHaveLength(1)
  })

  it('survives local CBoard reload and enters the expression matching pipeline', () => {
    const values = new Map<string, unknown>()
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      createBoards()
    )
    const created = createCustomPersonalPictogram(store.load(), {
      id: 'device_private_custom_persisted',
      boardId: 'food',
      image: 'wxfile://saved/apple.jpg',
      label: '苹果',
      synonyms: '水果,红苹果',
      category: '饮食'
    })

    store.save(created.boards)
    const match = searchExpressionPictograms(
      store.load(),
      '水果'
    ).matches.find(item => item.tile.id === created.tile.id)

    expect(values.has(PICTURE_LIBRARY_STORAGE_KEY)).toBe(true)
    expect(match?.tile).toEqual(
      expect.objectContaining({
        label: '苹果',
        image: 'wxfile://saved/apple.jpg'
      })
    )
  })

  it('does not classify arbitrary device-private replacement tiles as custom additions', () => {
    const boards = createBoards()
    boards[0] = {
      ...boards[0],
      tiles: [
        ...boards[0].tiles,
        {
          ...boards[0].tiles[0],
          id: 'ordinary-private',
          pictogramAttribution: {
            provider: 'device-private',
            originalId: 'ordinary-private',
            name: '本机图片',
            license: '仅本机',
            licenseUrl: null,
            author: null,
            authorUrl: null,
            sourceUrl: 'device-private://ordinary-private',
            repoKey: null
          }
        }
      ],
      layout: {
        ...boards[0].layout,
        tileIds: ['water', 'ordinary-private']
      }
    }

    expect(listCustomPersonalPictograms(boards)).toEqual([])
  })

  it('returns the removed tile so its saved image can be cleaned after persistence', () => {
    const created = createCustomPersonalPictogram(createBoards(), {
      id: 'device_private_custom_2',
      boardId: 'food',
      image: 'wxfile://saved/cup.jpg',
      label: '水杯'
    })
    const result = removeCustomPersonalPictogram(
      created.boards,
      'food',
      created.tile.id
    )

    expect(result?.removed.tile.image).toBe('wxfile://saved/cup.jpg')
    expect(result?.boards[0].tiles.map(tile => tile.id)).toEqual([
      'water'
    ])
  })

  it('edits saved metadata and moves the same private tile between CBoard boards', () => {
    const created = createCustomPersonalPictogram(
      [
        ...createBoards(),
        createBoardDTO({
          id: 'family',
          name: '家人',
          tiles: [{ id: 'mother', label: '妈妈' }]
        })
      ],
      {
        id: 'device_private_custom_edit',
        boardId: 'food',
        image: 'wxfile://saved/apple.jpg',
        label: '苹果'
      }
    )
    const updated = updateCustomPersonalPictogram(
      created.boards,
      'food',
      {
        id: created.tile.id,
        boardId: 'family',
        image: created.tile.image,
        label: '奶奶的苹果',
        vocalization: '我要奶奶的苹果',
        synonyms: '水果,红苹果',
        category: '家人',
        author: '家属',
        license: '家庭拍摄，仅限本机'
      }
    )

    expect(updated?.previous.boardId).toBe('food')
    expect(updated?.boards[0].tiles.map(tile => tile.id)).toEqual([
      'water'
    ])
    expect(updated?.boards[1].tiles.map(tile => tile.id)).toEqual([
      'mother',
      created.tile.id
    ])
    expect(updated?.tile).toEqual(
      expect.objectContaining({
        id: created.tile.id,
        boardId: 'family',
        label: '奶奶的苹果',
        vocalization: '我要奶奶的苹果',
        communication: expect.objectContaining({
          synonyms: ['水果', '红苹果'],
          category: '家人'
        }),
        pictogramAttribution: expect.objectContaining({
          provider: 'device-private',
          author: '家属',
          license: '家庭拍摄，仅限本机'
        })
      })
    )
  })

  it('refuses to edit a non-custom private replacement', () => {
    const boards = createBoards()
    expect(
      updateCustomPersonalPictogram(boards, 'food', {
        id: 'water',
        boardId: 'food',
        image: 'wxfile://saved/water.jpg',
        label: '我的水'
      })
    ).toBeNull()
  })

  it('copies a personal card to another board while sharing its saved media safely', () => {
    const boards = [
      ...createBoards(),
      createBoardDTO({
        id: 'family',
        name: '家人',
        tiles: [{ id: 'mother', label: '妈妈' }]
      })
    ]
    const created = createCustomPersonalPictogram(boards, {
      id: 'device_private_custom_shared',
      boardId: 'food',
      image: 'wxfile://saved/apple.jpg',
      mediaType: 'video',
      video: 'wxfile://saved/apple-action.mp4',
      sound: 'wxfile://saved/apple.mp3',
      label: '奶奶的苹果',
      synonyms: '苹果,水果'
    })
    const copied = copyCustomPersonalPictogram(
      created.boards,
      'food',
      created.tile.id,
      {
        id: 'device_private_custom_shared_copy',
        targetBoardId: 'family'
      }
    )

    expect(copied?.tile).toEqual(
      expect.objectContaining({
        boardId: 'family',
        image: created.tile.image,
        mediaType: created.tile.mediaType,
        video: created.tile.video,
        sound: created.tile.sound,
        communication: created.tile.communication,
        pictogramAttribution: created.tile.pictogramAttribution
      })
    )
    expect(listCustomPersonalPictograms(copied!.boards)).toHaveLength(2)
    expect(
      isCustomPictogramMediaReferencedElsewhere(
        copied!.boards,
        'food',
        created.tile.id,
        'image',
        created.tile.image
      )
    ).toBe(true)
    expect(
      isCustomPictogramMediaReferencedElsewhere(
        copied!.boards,
        'food',
        created.tile.id,
        'video',
        created.tile.video || ''
      )
    ).toBe(true)
    expect(
      isCustomPictogramMediaReferencedElsewhere(
        copied!.boards,
        'family',
        copied!.tile.id,
        'sound',
        copied!.tile.sound
      )
    ).toBe(true)
    expect(() =>
      copyCustomPersonalPictogram(
        copied!.boards,
        'food',
        created.tile.id,
        {
          id: 'device_private_custom_duplicate',
          targetBoardId: 'family'
        }
      )
    ).toThrow('already exists in target board')
  })

  it('moves personal cards in display order and persists that order locally', () => {
    const first = createCustomPersonalPictogram(createBoards(), {
      id: 'device_private_custom_first',
      boardId: 'food',
      image: 'wxfile://saved/first.jpg',
      label: '第一张'
    })
    const second = createCustomPersonalPictogram(first.boards, {
      id: 'device_private_custom_second',
      boardId: 'food',
      image: 'wxfile://saved/second.jpg',
      label: '第二张'
    })
    const moved = moveCustomPersonalPictogram(
      second.boards,
      'food',
      second.tile.id,
      'earlier'
    )

    expect(moved?.changed).toBe(true)
    expect(moved?.boards[0].layout.tileIds).toEqual([
      'water',
      second.tile.id,
      first.tile.id
    ])
    expect(
      listCustomPersonalPictograms(moved!.boards).map(
        entry => entry.tile.id
      )
    ).toEqual([second.tile.id, first.tile.id])

    const values = new Map<string, unknown>()
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      createBoards()
    )
    store.save(moved!.boards)
    expect(store.load()[0].layout.tileIds).toEqual([
      'water',
      second.tile.id,
      first.tile.id
    ])
  })

  it('does not rewrite storage state when a personal card is already at the boundary', () => {
    const created = createCustomPersonalPictogram(createBoards(), {
      id: 'device_private_custom_only',
      boardId: 'food',
      image: 'wxfile://saved/only.jpg',
      label: '唯一图卡'
    })
    const movedToStart = moveCustomPersonalPictogram(
      created.boards,
      'food',
      created.tile.id,
      'earlier'
    )
    const atBoundary = moveCustomPersonalPictogram(
      movedToStart!.boards,
      'food',
      created.tile.id,
      'earlier'
    )

    expect(movedToStart?.changed).toBe(true)
    expect(atBoundary?.changed).toBe(false)
    expect(atBoundary?.boards).toBe(movedToStart?.boards)
  })
})
