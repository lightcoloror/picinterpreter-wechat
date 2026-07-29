import { describe, expect, test } from 'vitest'
import {
  analyzeCommunicationMatching
} from '@cboard-communication-core/matchingDiagnostics'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'

describe('WeChat matching diagnostics', () => {
  test('uses packaged CBoard BoardDTO images through the shared matcher', () => {
    const result = analyzeCommunicationMatching(
      '我想喝水水杯',
      DEFAULT_BOARD_FIXTURES,
      {
        preSegmented: ['我', '想', '喝', '水', '水杯'],
        now: () => 10
      }
    )

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: '喝',
          matched: true,
          image: expect.any(String)
        }),
        expect.objectContaining({
          token: '水',
          matched: true,
          image: expect.any(String)
        }),
        expect.objectContaining({
          token: '水杯',
          matched: false
        })
      ])
    )
    expect(result.unmatchedTokens).toContain('水杯')
  })
})
