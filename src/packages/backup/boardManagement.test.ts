import { describe, expect, it } from 'vitest'
import {
  addCommunicationBoardLink,
  createPersonalCommunicationBoard,
  moveCommunicationBoard,
  removeCommunicationBoardLink,
  removePersonalCommunicationBoard,
  renamePersonalCommunicationBoard
} from '@cboard-communication-core/boardManagement'
import { createBoardDTO } from '@cboard-communication-core/dto'

import {
  PICTURE_LIBRARY_STORAGE_KEY,
  createPictureLibraryStore
} from '../../platform/pictureLibraryStore'

describe('personal board management persistence', () => {
  it('creates, renames, reorders and removes an empty personal board through the picture store', () => {
    const values = new Map<string, unknown>()
    const fallback = [
      createBoardDTO({
        id: 'root',
        name: '首页',
        tiles: [{ id: 'water', label: '水' }]
      })
    ]
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      fallback
    )

    const created = createPersonalCommunicationBoard(store.load(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards
    store.save(created)
    const moved = moveCommunicationBoard(
      store.load(),
      'device_private_board_family',
      'up'
    )
    store.save(moved)
    const renamed = renamePersonalCommunicationBoard(
      store.load(),
      'device_private_board_family',
      '熟悉的人'
    )
    store.save(renamed)

    expect(values.has(PICTURE_LIBRARY_STORAGE_KEY)).toBe(true)
    expect(store.load().map(board => board.name)).toEqual([
      '熟悉的人',
      '首页'
    ])

    const removed = removePersonalCommunicationBoard(
      store.load(),
      'device_private_board_family'
    )
    store.save(removed)
    expect(store.load().map(board => board.id)).toEqual(['root'])
  })

  it('persists and removes personal board navigation links through the picture store', () => {
    const values = new Map<string, unknown>()
    const fallback = [
      createBoardDTO({
        id: 'root',
        name: '首页',
        tiles: [{ id: 'water', label: '水', image: '/water.png' }]
      })
    ]
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      fallback
    )
    const withFamily = createPersonalCommunicationBoard(store.load(), {
      id: 'device_private_board_family',
      name: '家人'
    }).boards
    store.save(withFamily)

    const linked = addCommunicationBoardLink(store.load(), {
      sourceBoardId: 'root',
      targetBoardId: 'device_private_board_family',
      tileId: 'device_private_link_family'
    }).boards
    store.save(linked)

    expect(
      store
        .load()
        .find(board => board.id === 'root')
        ?.tiles[1]
    ).toEqual(
      expect.objectContaining({
        label: '家人',
        loadBoardId: 'device_private_board_family'
      })
    )

    const unlinked = removeCommunicationBoardLink(
      store.load(),
      'root',
      'device_private_board_family'
    )
    store.save(unlinked)
    expect(
      store
        .load()
        .find(board => board.id === 'root')
        ?.tiles
        .map(tile => tile.id)
    ).toEqual(['water'])
  })
})
