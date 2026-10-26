import { describe, expect, test } from 'vitest'
import { applyCommunicationAiResegmentation } from '@cboard-communication-core/communicationAi'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import {
  buildConfirmedReceiverHistory,
  replaceReceiverItem,
  replaceReceiverReviewItems,
  retainReceiverItemAsText,
  restoreReceiverWorkspaceFromRecord,
  runReceiverSession
} from './receiverSession'

describe('receiver AI continuity through the shared core', () => {
  test('preserves separate manual and text choices for repeated words after AI and offline restore', () => {
    let index = 0
    let state = runReceiverSession('水水', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['水', '水'], createId: () => `review-${index++}`
    })
    const existing = state.reviewItems[0].tile!
    expect(existing).not.toBeNull()
    const selected = {
      ...existing, id: 'private-water',
      tile: { ...existing.tile, id: 'private-water', image: '/saved/private-water.png' }
    }
    state = replaceReceiverItem(state, state.reviewItems[0].id, selected)
    state = retainReceiverItemAsText(state, state.reviewItems[1].id)
    const suggestion = applyCommunicationAiResegmentation({
      text: state.inputText, boards: DEFAULT_BOARD_FIXTURES,
      currentReviewItems: state.reviewItems, response: { tokens: ['水', '水'] }
    })
    expect(suggestion.requiresConfirmation).toBe(true)
    expect(suggestion.reviewItems[0].tile).toBe(selected)
    expect(suggestion.reviewItems[1].tile!.textOnly).toBe(true)
    const accepted = replaceReceiverReviewItems(state, suggestion.reviewItems)
    expect(accepted.quality).toMatchObject({ imageCount: 1, textOnlyCount: 1 })
    const entry = JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(accepted)))
    const restored = restoreReceiverWorkspaceFromRecord({
      ...entry, id: 'synthetic-ai-continuity', recordStatus: 'confirmed'
    }, [])!
    expect(restored.session.reviewItems[0].tile!.tile.image).toBe('/saved/private-water.png')
    expect(restored.session.reviewItems[1].tile!.textOnly).toBe(true)
    expect(restored.session.reviewItems.map(item => item.token).join('')).toBe('水水')
  })

  test.each(['ai', 'lexicon'])('rejects obsolete %s draft matches in the platform restore flow', matchType => {
    const restored = restoreReceiverWorkspaceFromRecord({
      id: `synthetic-old-${matchType}`, direction: 'receive', recordStatus: 'draft', inputText: '分叉',
      output: [{ id: 'fork', label: '叉子', image: '/saved/fork.svg' }],
      pictogramSequence: [{ pictogramId: 'fork', label: '叉子', originalToken: '分叉', matchType }]
    } as Parameters<typeof restoreReceiverWorkspaceFromRecord>[0], [])!
    expect(restored.session.reviewItems[0].tile).toBeNull()
    expect(restored.session.reviewItems[0].token).toBe('分叉')
  })
})
