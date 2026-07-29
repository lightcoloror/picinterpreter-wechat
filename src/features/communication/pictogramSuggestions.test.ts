import { describe, expect, test } from 'vitest'
import {
  buildExpressionPictogramSuggestions,
  PICTOGRAM_SUGGESTION_MODES
} from '@cboard-communication-core/pictogramSuggestions'
import type { PictogramOrderingState } from '@cboard-communication-core/pictogramOrdering'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'

const DRINKS_BOARD_ID = 'HJmKTw2vT-'
const WATER_TILE_ID = 'SystfA56X5KZ'
const TEA_TILE_ID = 'B1r9f056mctW'
const COFFEE_TILE_ID = 'B1I9M05pQ9Yb'

function createOrdering(
  usageByTileKey: PictogramOrderingState['usageByTileKey']
): PictogramOrderingState {
  return {
    schemaVersion: 1,
    manualOrderByBoard: {},
    usageByTileKey
  }
}

describe('WeChat expression pictogram suggestions', () => {
  test('uses the packaged CBoard fixtures for recently used pictograms', () => {
    const result = buildExpressionPictogramSuggestions(
      DEFAULT_BOARD_FIXTURES,
      [],
      createOrdering({
        [`${DRINKS_BOARD_ID}:${WATER_TILE_ID}`]: {
          count: 2,
          lastUsedAt: 200
        },
        [`${DRINKS_BOARD_ID}:${TEA_TILE_ID}`]: {
          count: 4,
          lastUsedAt: 100
        }
      })
    )

    expect(result.mode).toBe(PICTOGRAM_SUGGESTION_MODES.recent)
    expect(result.tiles.map(tile => tile.label)).toEqual(['水', '茶'])
  })

  test('suggests popular same-category pictograms after the last selection', () => {
    const drinksBoard = DEFAULT_BOARD_FIXTURES.find(
      board => board.id === DRINKS_BOARD_ID
    )!
    const water = drinksBoard.tiles.find(tile => tile.id === WATER_TILE_ID)!
    const result = buildExpressionPictogramSuggestions(
      DEFAULT_BOARD_FIXTURES,
      [water],
      createOrdering({
        [`${DRINKS_BOARD_ID}:${TEA_TILE_ID}`]: {
          count: 4,
          lastUsedAt: 100
        },
        [`${DRINKS_BOARD_ID}:${COFFEE_TILE_ID}`]: {
          count: 2,
          lastUsedAt: 200
        }
      }),
      { activeBoardId: DRINKS_BOARD_ID, limit: 2 }
    )

    expect(result.mode).toBe(PICTOGRAM_SUGGESTION_MODES.next)
    expect(result.category).toBe('food')
    expect(result.tiles.map(tile => tile.label)).toEqual(['茶', '咖啡'])
  })
})
