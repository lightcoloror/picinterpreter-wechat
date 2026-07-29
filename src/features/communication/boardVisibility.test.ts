import { describe, expect, test } from 'vitest'
import { projectVisibleCommunicationBoards } from '@cboard-communication-core/communicationPreferences'
import { getBoardDTOTilesInDisplayOrder } from '@cboard-communication-core/dto'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'

const QUICK_CHAT_BOARD_ID = 'BJgYav2vp-'
const QUICK_CHAT_FOLDER_TILE_ID = 'S1LQGA9p7qK-'

describe('patient board visibility projection', () => {
  test('removes a hidden CBoard folder while preserving a valid BoardDTO layout', () => {
    const projected = projectVisibleCommunicationBoards(
      DEFAULT_BOARD_FIXTURES,
      [QUICK_CHAT_BOARD_ID]
    )
    const rootBoard = projected.find(board => board.id === 'root')

    expect(projected.some(board => board.id === QUICK_CHAT_BOARD_ID)).toBe(false)
    expect(rootBoard).toBeDefined()
    expect(
      getBoardDTOTilesInDisplayOrder(rootBoard!).some(
        tile => tile.id === QUICK_CHAT_FOLDER_TILE_ID
      )
    ).toBe(false)
    expect(
      DEFAULT_BOARD_FIXTURES[0].tiles.some(
        tile => tile.id === QUICK_CHAT_FOLDER_TILE_ID
      )
    ).toBe(true)
  })
})
