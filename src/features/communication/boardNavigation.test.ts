import { describe, expect, test } from 'vitest'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import {
  createBoardNavigationState,
  getActiveNavigationBoard,
  getSelectableBoardTiles,
  getVisibleBoardTiles,
  navigateToPreviousBoard,
  navigateToRootBoard,
  openNavigationTile
} from './boardNavigation'

describe('WeChat CBoard hierarchy navigation', () => {
  test('starts from the official root board instead of flattening 46 boards', () => {
    const state = createBoardNavigationState(DEFAULT_BOARD_FIXTURES)
    const board = getActiveNavigationBoard(DEFAULT_BOARD_FIXTURES, state)

    expect(board?.id).toBe('root')
    expect(board?.name).toBe('首页')
    expect(getVisibleBoardTiles(DEFAULT_BOARD_FIXTURES, state)).toHaveLength(42)
    expect(state.trail).toEqual([])
  })

  test('opens a linked child board and keeps CBoard display order', () => {
    const initial = createBoardNavigationState(DEFAULT_BOARD_FIXTURES)
    const drinksFolder = getVisibleBoardTiles(
      DEFAULT_BOARD_FIXTURES,
      initial
    ).find(tile => tile.loadBoardId === 'HJmKTw2vT-')!

    const drinksState = openNavigationTile(
      DEFAULT_BOARD_FIXTURES,
      initial,
      drinksFolder
    )

    expect(drinksState.activeBoardId).toBe('HJmKTw2vT-')
    expect(drinksState.trail).toEqual(['root'])
    expect(
      getVisibleBoardTiles(DEFAULT_BOARD_FIXTURES, drinksState).map(
        tile => tile.id
      )
    ).toEqual(
      getActiveNavigationBoard(
        DEFAULT_BOARD_FIXTURES,
        drinksState
      )?.layout.tileIds
    )
    expect(
      getVisibleBoardTiles(DEFAULT_BOARD_FIXTURES, drinksState).find(
        tile => tile.id === 'SystfA56X5KZ'
      )?.label
    ).toBe('水')
  })

  test('returns to the previous board or directly to home', () => {
    const initial = createBoardNavigationState(DEFAULT_BOARD_FIXTURES)
    const folder = getVisibleBoardTiles(DEFAULT_BOARD_FIXTURES, initial).find(
      tile => tile.loadBoardId === 'HJmKTw2vT-'
    )!
    const child = openNavigationTile(DEFAULT_BOARD_FIXTURES, initial, folder)

    expect(
      navigateToPreviousBoard(DEFAULT_BOARD_FIXTURES, child)
    ).toEqual(initial)
    expect(navigateToRootBoard(DEFAULT_BOARD_FIXTURES, child)).toEqual(initial)
  })

  test('keeps folder tiles out of the selectable communication catalog', () => {
    const initial = createBoardNavigationState(DEFAULT_BOARD_FIXTURES)
    const selectable = getSelectableBoardTiles(
      DEFAULT_BOARD_FIXTURES,
      initial
    )

    expect(selectable.map(tile => tile.label)).toEqual([
      '是',
      '不',
      '要',
      '不要',
      '帮帮我',
      '停止',
      '再说一次',
      '我痛',
      '我不舒服',
      '我要喝水',
      '我想上厕所',
      '请叫医生',
      '请叫家人'
    ])
    expect(selectable.every(tile => !tile.loadBoardId)).toBe(true)
  })

  test('does not navigate when a leaf tile is tapped', () => {
    const initial = createBoardNavigationState(DEFAULT_BOARD_FIXTURES)
    const yesTile = getVisibleBoardTiles(
      DEFAULT_BOARD_FIXTURES,
      initial
    ).find(tile => tile.id === 'HJVQMR9pX5F-')!

    expect(
      openNavigationTile(DEFAULT_BOARD_FIXTURES, initial, yesTile)
    ).toBe(initial)
  })
})
