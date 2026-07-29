import { describe, expect, test } from 'vitest'
import type { BoardDTO } from '@cboard-communication-core/dto'

import {
  DEFAULT_BOARD_FIXTURE,
  DEFAULT_BOARD_FIXTURES,
  DEFAULT_BOARD_TILES
} from '../../fixtures/defaultBoard'
import {
  createExpressionSession,
  createExpressionSessionFromSavedPhrase,
  createExpressionSessionFromTileReferences,
  expressionSessionReducer,
  restoreExpressionSession
} from './session'

const WANT_TILE = DEFAULT_BOARD_TILES.find(tile => tile.id === 'r1oHfCqTm9Yb')!
const DRINK_TILE = DEFAULT_BOARD_TILES.find(tile => tile.id === 'ryctMA9amqtZ')!
const WATER_TILE = DEFAULT_BOARD_TILES.find(tile => tile.id === 'SystfA56X5KZ')!

describe('WeChat expression session', () => {
  test('turns selected CBoard TileDTOs into expression candidates', () => {
    let state = createExpressionSession()
    state = expressionSessionReducer(state, {
      type: 'add-tile',
      tile: WANT_TILE
    })
    state = expressionSessionReducer(state, {
      type: 'add-tile',
      tile: DRINK_TILE
    })
    state = expressionSessionReducer(state, {
      type: 'add-tile',
      tile: WATER_TILE
    })

    expect(state.selectedTiles.map(tile => tile.label)).toEqual([
      '我想',
      '喝',
      '水'
    ])
    expect(state.pipeline.candidateSentences[0]).toBe('我想喝水。')
  })

  test('moves and removes any selected image while rebuilding candidates', () => {
    const initial = createExpressionSession([
      WANT_TILE,
      DRINK_TILE,
      WATER_TILE
    ])
    const moved = expressionSessionReducer(initial, {
      type: 'move-tile',
      index: 2,
      offset: -1
    })

    expect(moved.selectedTiles.map(tile => tile.id)).toEqual([
      WANT_TILE.id,
      WATER_TILE.id,
      DRINK_TILE.id
    ])
    expect(moved.pipeline.outputSnapshot.map(tile => tile.id)).toEqual([
      WANT_TILE.id,
      WATER_TILE.id,
      DRINK_TILE.id
    ])

    const removed = expressionSessionReducer(moved, {
      type: 'remove-tile',
      index: 1
    })
    expect(removed.selectedTiles.map(tile => tile.id)).toEqual([
      WANT_TILE.id,
      DRINK_TILE.id
    ])
    expect(removed.pipeline.outputSnapshot.map(tile => tile.id)).toEqual([
      WANT_TILE.id,
      DRINK_TILE.id
    ])
    expect(
      expressionSessionReducer(removed, {
        type: 'move-tile',
        index: 0,
        offset: -1
      })
    ).toBe(removed)
  })

  test('restores the latest confirmed expression with current fixture tiles', () => {
    const restored = restoreExpressionSession(DEFAULT_BOARD_FIXTURES, [
      {
        contractVersion: 1,
        direction: 'express',
        sentence: '请给我一点水。',
        labels: ['我想要', '水'],
        output: [WANT_TILE, WATER_TILE],
        candidateSentences: ['我想要水。']
      }
    ])

    expect(restored.restored).toBe(true)
    expect(restored.selectedTiles.map(tile => tile.id)).toEqual([
      WANT_TILE.id,
      WATER_TILE.id
    ])
    expect(restored.pipeline.candidateSentences[0]).toBe('请给我一点水。')
  })

  test('restores expressions only from the active conversation session', () => {
    const restored = restoreExpressionSession(
      DEFAULT_BOARD_FIXTURES,
      [
        {
          direction: 'express',
          sessionId: 'session-old',
          sentence: '旧对话',
          labels: ['我想要'],
          output: [WANT_TILE]
        },
        {
          direction: 'express',
          sessionId: 'session-current',
          sentence: '当前对话',
          labels: ['水'],
          output: [WATER_TILE]
        }
      ],
      'session-current'
    )

    expect(restored.restored).toBe(true)
    expect(restored.selectedTiles.map(tile => tile.id)).toEqual([
      WATER_TILE.id
    ])
    expect(restored.pipeline.candidateSentences[0]).toBe('当前对话')
  })

  test('drops stored tiles that no longer exist in the fixture', () => {
    const restored = restoreExpressionSession(DEFAULT_BOARD_FIXTURES, [
      {
        direction: 'express',
        sentence: '旧表达',
        labels: ['旧图'],
        output: [
          {
            ...WANT_TILE,
            id: 'removed-tile'
          }
        ]
      }
    ])

    expect(restored.restored).toBe(false)
    expect(restored.selectedTiles).toEqual([])
  })

  test('restores a saved tile after it moves to another board', () => {
    const actionBoard: BoardDTO = {
      ...DEFAULT_BOARD_FIXTURE,
      id: 'actions-board',
      name: '动作',
      layout: { columns: 1, rows: 1, tileIds: [WANT_TILE.id] },
      tiles: [{ ...WANT_TILE, boardId: 'actions-board' }]
    }
    const drinkBoard: BoardDTO = {
      ...DEFAULT_BOARD_FIXTURE,
      id: 'drinks-board',
      name: '饮品',
      layout: { columns: 1, rows: 1, tileIds: [WATER_TILE.id] },
      tiles: [{ ...WATER_TILE, boardId: 'drinks-board' }]
    }
    const restored = restoreExpressionSession([actionBoard, drinkBoard], [
      {
        contractVersion: 1,
        direction: 'express',
        sentence: '我想喝水。',
        labels: ['水'],
        output: [WATER_TILE]
      }
    ])

    expect(restored.restored).toBe(true)
    expect(restored.selectedTiles[0]).toEqual(
      expect.objectContaining({ id: WATER_TILE.id, boardId: 'drinks-board' })
    )
  })


  test('reuses a common phrase with current board tiles and its saved sentence', () => {
    const drinkBoard: BoardDTO = {
      ...DEFAULT_BOARD_FIXTURE,
      id: 'drinks-board',
      name: '饮品',
      layout: { columns: 1, rows: 1, tileIds: [WATER_TILE.id] },
      tiles: [{ ...WATER_TILE, boardId: 'drinks-board' }]
    }
    const reused = createExpressionSessionFromSavedPhrase(drinkBoard, {
      contractVersion: 1,
      sentence: '请给我一点水。',
      output: [WATER_TILE]
    })
    const next = expressionSessionReducer(createExpressionSession(), {
      type: 'replace-session',
      state: reused
    })

    expect(next.selectedTiles[0]).toEqual(
      expect.objectContaining({ id: WATER_TILE.id, boardId: 'drinks-board' })
    )
    expect(next.pipeline.candidateSentences[0]).toBe('请给我一点水。')
  })

  test('restores an unconfirmed draft from current tile references', () => {
    const restored = createExpressionSessionFromTileReferences(
      DEFAULT_BOARD_FIXTURES,
      [
        { id: WANT_TILE.id, boardId: WANT_TILE.boardId },
        { id: WATER_TILE.id, boardId: WATER_TILE.boardId }
      ]
    )

    expect(restored.restored).toBe(true)
    expect(restored.selectedTiles.map(tile => tile.id)).toEqual([
      WANT_TILE.id,
      WATER_TILE.id
    ])
  })
})
