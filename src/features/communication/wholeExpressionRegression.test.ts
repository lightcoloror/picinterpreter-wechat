import { expect, test } from 'vitest'
import fixtures from '@cboard-communication-core/fixtures/wholeExpressionRegression.json'
import dailyCards from '@cboard-communication-core/fixtures/dailyCardReuseRegression.json'
import politeExpressions from '@cboard-communication-core/fixtures/politeExpressionRegression.json'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

const cases: Array<{ text: string; tokens: string[]; miniTokens?: string[]; fallbackTokens?: string[]; picture?: string[] }> = [...fixtures.cases, ...dailyCards.cases, ...politeExpressions.cases]
test.each(cases)('keeps a complete expression through mini-program restart: $text', ({ text, tokens, miniTokens, fallbackTokens, picture }) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
      let state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
      // The compact mini catalog includes a complete possessive "我的" card.
      const expected = miniTokens || (fallback && fallbackTokens) || tokens
      expect(state.reviewItems.map(m => m.token)).toEqual(expected)
      if (picture) expect(state.reviewItems.find(m => m.token === picture[0])?.tile?.id).toBe(picture[1])
      if (miniTokens) {
        expect(state.reviewItems.find(m => m.token === '我的')?.tile).toBeTruthy()
        expect(state.reviewItems.some(m => m.tile?.id === 'pi-home-help')).toBe(false)
      }
      state.reviewItems.filter(m => !m.tile).forEach(m => { state = retainReceiverItemAsText(state, m.id) })
      const history = buildConfirmedReceiverHistory(state)!
      const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'synthetic-whole-expression', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
      expect(restored.session.reviewItems.map(m => m.token)).toEqual(expected)
      expect(restored.session.outputPreview.map(m => m.vocalization).join('')).toBe(text)
    }
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor!) }
})
