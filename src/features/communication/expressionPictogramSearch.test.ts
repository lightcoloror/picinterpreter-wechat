import { describe, expect, test } from 'vitest'
import {
  EXPRESSION_PICTOGRAM_MATCH_TYPES,
  searchExpressionPictograms
} from '@cboard-communication-core/expressionPictogramSearch'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'

describe('WeChat expression pictogram search', () => {
  test('finds the packaged spoon image through its Chinese synonym', () => {
    const result = searchExpressionPictograms(
      DEFAULT_BOARD_FIXTURES,
      '汤匙'
    )
    const spoon = result.matches.find(match => match.tile.label === '勺子')

    expect(spoon).toBeDefined()
    expect(spoon?.matchType).toBe(
      EXPRESSION_PICTOGRAM_MATCH_TYPES.exactSynonym
    )
    expect(spoon?.tile.loadBoardId).toBe('')
    expect(spoon?.tile.image).toMatch(
      /^\/assets\/cboard-default\//
    )
  })

  test('keeps exact labels ahead of broader cross-board matches', () => {
    const result = searchExpressionPictograms(
      DEFAULT_BOARD_FIXTURES,
      '水',
      { limit: 6 }
    )

    expect(result.matches[0].tile.label).toBe('水')
    expect(result.matches[0].matchType).toBe(
      EXPRESSION_PICTOGRAM_MATCH_TYPES.exactLabel
    )
    expect(result.matches.every(match => !match.tile.loadBoardId)).toBe(true)
  })
})
