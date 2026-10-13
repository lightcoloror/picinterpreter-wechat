import { expect, test } from 'vitest'
import fixtures from '@cboard-communication-core/fixtures/actionConceptRegression.json'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each(fixtures.cases)('retains complete concepts through mini-program confirmation and restart: $text', ({ text, tokens }) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
      let state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
      expect(state.reviewItems.map(m => m.token)).toEqual(tokens)
      state.reviewItems.filter(m => !m.tile).forEach(m => { state = retainReceiverItemAsText(state, m.id) })
      const history = buildConfirmedReceiverHistory(state)!
      const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'synthetic-action-concept', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
      expect(restored.session.reviewItems.map(m => m.token)).toEqual(tokens)
      expect(restored.session.outputPreview.map(m => m.vocalization).join('')).toBe(text)
    }
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor!) }
})
