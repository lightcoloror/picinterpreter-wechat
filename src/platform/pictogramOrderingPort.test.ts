import { describe, expect, test } from 'vitest'
import { createWechatKeyValueStore } from '@cboard-communication-core/adapters/wechatStorage'
import type { TileDTO } from '@cboard-communication-core/dto'
import { createPictogramOrderingStore } from '@cboard-communication-core/pictogramOrderingStore'

function createTile(id: string): TileDTO {
  return {
    dtoType: 'TileDTO',
    version: 1,
    id,
    boardId: 'food',
    label: id,
    vocalization: id,
    image: '',
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
}

describe('WeChat pictogram ordering storage port', () => {
  test('restores manual order and usage counts through WeChat storage semantics', () => {
    const values = new Map<string, unknown>()
    const storage = createWechatKeyValueStore({
      getStorageSync: key => values.get(key),
      setStorageSync: (key, value) => values.set(key, value)
    })
    const store = createPictogramOrderingStore(storage)
    const tiles = [createTile('water'), createTile('rice')]

    store.moveManualOrder(tiles, 'food', 'rice', 'up')
    store.recordUsage('food', 'water', 123)

    expect(store.load()).toEqual({
      schemaVersion: 1,
      manualOrderByBoard: { food: ['rice', 'water'] },
      usageByTileKey: {
        'food:water': { count: 1, lastUsedAt: 123 }
      }
    })
  })
})
