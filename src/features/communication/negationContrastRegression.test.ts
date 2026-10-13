import { expect, test } from 'vitest'
import fixtures from '@cboard-communication-core/fixtures/negationContrastRegression.json'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each(fixtures.cases)('keeps negation and intention in order after mini-program restart: $id', ({ text, tokens }) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
      const state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
      expect(state.reviewItems.map(m => m.token)).toEqual(tokens)
      let next = state
      state.reviewItems.filter(m => !m.tile).forEach(m => { next = retainReceiverItemAsText(next, m.id) })
      const history = buildConfirmedReceiverHistory(next)!
      expect(history.output!.map(m => m.vocalization).join('')).toBe(text)
      const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'synthetic-negation-contrast', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
      expect(restored.session.reviewItems.map(m => m.token)).toEqual(tokens)
      expect(restored.session.outputPreview.map(m => m.vocalization).join('')).toBe(text)
    }
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor!) }
})
