import { expect, test } from 'vitest'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each(['我不喝水', '我不要吃药', '我想上厕所', '我右肩疼，左肩不疼', '慢一点，慢一点'])('keeps received words with pictures across mini-program offline restoration: %s', text => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
      const state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
      if (text === '我不喝水') expect(state.reviewItems.map(m => m.token)).toEqual(['我', '不', '喝', '水'])
      if (text.startsWith('慢一点')) expect(state.reviewItems.some(m => m.tile?.id === 'pi-repair-slowly')).toBe(false)
      let next = state
      state.reviewItems.filter(m => !m.tile).forEach(m => { next = retainReceiverItemAsText(next, m.id) })
      const history = buildConfirmedReceiverHistory(next)!
      expect(history.output!.map(m => m.vocalization).join('')).toBe(text)
      const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'synthetic-jieba-comparison', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
      expect(restored.session.outputPreview.map(m => m.vocalization).join('')).toBe(text)
    }
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor!) }
})
