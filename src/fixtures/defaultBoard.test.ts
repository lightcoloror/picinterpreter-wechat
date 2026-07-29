import { describe, expect, test } from 'vitest'

import { DEFAULT_BOARD_FIXTURES, DEFAULT_BOARD_TILES } from './defaultBoard'

function getDefaultTileByKeyPath(keyPath: string) {
  const tile = DEFAULT_BOARD_TILES.find(item => item.keyPath === keyPath)

  expect(tile).toBeDefined()
  return tile!
}

describe('CBoard Chinese default board calibration', () => {
  test.each([
    ['symbol.drinkType.milk', '牛奶'],
    ['symbol.foodKitchenItems.fork', '叉子'],
    ['symbol.foodKitchenItems.knife', '刀'],
    ['symbol.foodKitchenItems.spoon', '勺子'],
    ['symbol.foodKitchenItems.bowl', '碗']
  ])('keeps the visible label and vocalization aligned for %s', (keyPath, label) => {
    const tile = getDefaultTileByKeyPath(keyPath)

    expect(tile.label).toBe(label)
    expect(tile.vocalization).toBe(label)
  })

  test('uses the target board name for every navigation tile', () => {
    const boardNames = new Map(
      DEFAULT_BOARD_FIXTURES.map(board => [board.id, board.name])
    )
    const navigationTiles = DEFAULT_BOARD_TILES.filter(
      tile => tile.loadBoardId
    )

    expect(navigationTiles.length).toBeGreaterThan(0)
    navigationTiles.forEach(tile => {
      const targetBoardName = boardNames.get(tile.loadBoardId)

      expect(targetBoardName).toBeTruthy()
      expect(tile.label).toBe(targetBoardName)
      expect(tile.vocalization).toBe(targetBoardName)
    })
  })

  test('keeps the PicInterpreter adult-care home, core and repair boards', () => {
    const root = DEFAULT_BOARD_FIXTURES.find(board => board.id === 'root')!
    const core = DEFAULT_BOARD_FIXTURES.find(
      board => board.id === 'pi-core-words-v1'
    )!
    const repair = DEFAULT_BOARD_FIXTURES.find(
      board => board.id === 'pi-repair-v1'
    )!

    expect(DEFAULT_BOARD_FIXTURES).toHaveLength(46)
    expect(root.tiles.map(tile => tile.label)).toEqual(
      expect.arrayContaining([
        '帮帮我',
        '停止',
        '我痛',
        '我要喝水',
        '核心词',
        '修正澄清'
      ])
    )
    expect(core.tiles).toHaveLength(15)
    expect(repair.tiles.map(tile => tile.label)).toEqual(
      expect.arrayContaining(['不对', '写下来', '指给我看', '给我选项'])
    )

    const help = root.tiles.find(tile => tile.id === 'pi-home-help')!
    expect(help.pictogramAttribution).toEqual(
      expect.objectContaining({
        provider: 'arasaac',
        originalId: '32648'
      })
    )
  })
})
