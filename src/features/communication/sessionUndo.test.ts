import { describe, expect, test } from 'vitest'
import { DEFAULT_BOARD_TILES } from '../../fixtures/defaultBoard'
import {
  createExpressionSession,
  expressionSessionReducer as reduce,
  MAX_EXPRESSION_UNDO,
  type ExpressionSessionState
} from './session'

const tiles = DEFAULT_BOARD_TILES.filter(tile => !tile.loadBoardId).slice(0, 3)

describe('expression deletion recovery', () => {
  test('backspace, clear and consecutive undo restore exact order and duplicate cards', () => {
    const original = createExpressionSession([tiles[0], tiles[1], tiles[0]])
    const backspaced = reduce(original, { type: 'remove-last' })
    const cleared = reduce(backspaced, { type: 'clear' })
    expect(cleared.selectedTiles).toEqual([])
    const first = reduce(cleared, { type: 'undo-delete' })
    expect(first.selectedTiles).toEqual(backspaced.selectedTiles)
    const second = reduce(first, { type: 'undo-delete' })
    expect(second.selectedTiles).toEqual(original.selectedTiles)
    expect(second.pipeline).toBe(original.pipeline)
    expect(reduce(second, { type: 'undo-delete' })).toBe(second)
  })

  test('removing a middle card is also reversible', () => {
    const original = createExpressionSession(tiles)
    const removed = reduce(original, { type: 'remove-tile', index: 1 })
    expect(removed.selectedTiles).toEqual([tiles[0], tiles[2]])
    expect(reduce(removed, { type: 'undo-delete' }).selectedTiles).toEqual(tiles)
  })

  test('empty deletion and invalid indices keep the usable recovery point', () => {
    const original = createExpressionSession(tiles)
    const cleared = reduce(original, { type: 'clear' })
    for (const action of [
      { type: 'clear' }, { type: 'remove-last' },
      { type: 'remove-tile', index: -1 }, { type: 'remove-tile', index: 99 }
    ] as const) expect(reduce(cleared, action)).toBe(cleared)
    expect(reduce(cleared, { type: 'undo-delete' }).selectedTiles).toEqual(tiles)
  })

  test('offline undo keeps the saved media URI and AI candidate selection without fetching', () => {
    const cached = { ...tiles[0], image: 'wxfile://usr/synthetic-confirmed-card.png' }
    const initial = createExpressionSession([cached])
    const original: ExpressionSessionState = {
      ...initial,
      pipeline: { ...initial.pipeline, candidateSentences: ['我要喝水。', '请给我水。', '我想喝水。'] }
    }
    const selected = reduce(original, { type: 'select-candidate', index: 1 })
    const restored = reduce(reduce(selected, { type: 'clear' }), { type: 'undo-delete' })
    expect(restored.selectedTiles[0]).toBe(cached)
    expect(restored.selectedTiles[0].image).toBe(cached.image)
    expect(restored.pipeline).toBe(selected.pipeline)
  })

  test('a new picture or rearrangement starts a new sequence without old recovery', () => {
    const deleted = reduce(createExpressionSession(tiles), { type: 'remove-last' })
    for (const next of [
      reduce(deleted, { type: 'add-tile', tile: tiles[2] }),
      reduce(deleted, { type: 'move-tile', index: 0, offset: 1 })
    ]) {
      expect(next.undoHistory?.length || 0).toBe(0)
      expect(reduce(next, { type: 'undo-delete' })).toBe(next)
    }
  })

  test('session reset and saved phrase replacement cannot restore previous family cards', () => {
    const deleted = reduce(createExpressionSession(tiles), { type: 'clear' })
    const reset = reduce(deleted, { type: 'reset' })
    expect(reset).toEqual(createExpressionSession())
    expect(reduce(reset, { type: 'undo-delete' })).toBe(reset)
    const replaced = reduce(deleted, { type: 'replace-session', state: deleted })
    expect(replaced.undoHistory).toBeUndefined()
    expect(reduce(replaced, { type: 'undo-delete' })).toBe(replaced)
  })

  test('offline sequence can undo every backspace without retaining a recursive history', () => {
    const repeated = Array.from({ length: 12 }, (_, i) => tiles[i % tiles.length])
    let state = createExpressionSession(repeated)
    for (let i = 0; i < repeated.length; i++) state = reduce(state, { type: 'remove-last' })
    expect(state.selectedTiles).toEqual([])
    expect(state.undoHistory).toHaveLength(12)
    expect(state.undoHistory?.every(snapshot => !('undoHistory' in snapshot))).toBe(true)
    for (let i = 1; i <= repeated.length; i++) {
      state = reduce(state, { type: 'undo-delete' })
      expect(state.selectedTiles).toEqual(repeated.slice(0, i))
    }
  })

  test('bounds memory and does not persist undo into a reopened session', () => {
    const initial = createExpressionSession(tiles)
    const filled = { ...initial, undoHistory: Array.from({ length: MAX_EXPRESSION_UNDO }, () => initial) }
    const next = reduce(filled, { type: 'clear' })
    expect(next.undoHistory).toHaveLength(MAX_EXPRESSION_UNDO)
    expect(createExpressionSession(next.selectedTiles).undoHistory).toBeUndefined()
  })
})
