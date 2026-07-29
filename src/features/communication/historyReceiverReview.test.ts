import { describe, expect, test } from 'vitest'
import {
  RECEIVER_CORRECTION_ACTIONS
} from '@cboard-communication-core/receiverLifecycle'
import {
  replaceReceiverReviewItem
} from '@cboard-communication-core/receiverPipeline'

import {
  DEFAULT_BOARD_FIXTURES,
  DEFAULT_BOARD_TILES
} from '../../fixtures/defaultBoard'
import {
  buildHistoryReceiverReviewCorrection,
  createHistoryReceiverReviewState
} from './historyReceiverReview'

describe('WeChat caregiver history receiver review', () => {
  test('restores a confirmed fixture sequence and emits append-only correction evidence', () => {
    const water = DEFAULT_BOARD_TILES.find(tile => tile.label === '水')!
    const drink = DEFAULT_BOARD_TILES.find(tile => tile.label === '喝')!
    const state = createHistoryReceiverReviewState(
      {
        id: 'receiver-1',
        sessionId: 'session-1',
        patientId: 'patient-1',
        workspaceId: 'workspace-1',
        direction: 'receive',
        inputText: '喝水',
        labels: ['水'],
        recordStatus: 'confirmed',
        createdAt: 1,
        updatedAt: 1,
        pictogramSequence: [
          {
            pictogramId: water.id,
            label: water.label,
            source: 'local_dict',
            boardId: water.boardId,
            matchType: 'exact',
            confidence: 1,
            originalToken: '水'
          }
        ]
      },
      [],
      DEFAULT_BOARD_FIXTURES
    )!
    const drinkCandidate = state.reviewItems[0].tile
      ? {
          ...state.reviewItems[0].tile,
          id: drink.id,
          tile: drink,
          boardId: drink.boardId,
          displayLabel: drink.label
        }
      : null

    expect(drinkCandidate).not.toBeNull()
    const nextItems = replaceReceiverReviewItem(
      state.reviewItems,
      state.reviewItems[0].id,
      drinkCandidate!
    )
    const correction = buildHistoryReceiverReviewCorrection(
      state,
      RECEIVER_CORRECTION_ACTIONS.replace,
      nextItems,
      state.reviewItems[0].id,
      {
        now: () => 20,
        createId: prefix => `${prefix}-fixed`
      }
    )

    expect(correction).toEqual(
      expect.objectContaining({
        id: 'correction-fixed',
        expressionId: 'receiver-1',
        context: 'caregiver_history_review',
        pictogramIdBefore: water.id,
        pictogramIdAfter: drink.id,
        revisionAfter: expect.objectContaining({
          labels: [drink.label]
        })
      })
    )
    expect(state.record.labels).toEqual(['水'])
  })
})
