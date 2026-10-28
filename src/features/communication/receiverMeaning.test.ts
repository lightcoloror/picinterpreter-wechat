import { expect, test } from 'vitest'
import { buildReceiverMeaningAssessment, prepareReceiverAssistedItems } from '@cboard-communication-core/receiverPipeline'
import { getLocalPictogramCandidates } from '@cboard-communication-core/pictogramSemantics'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, getReceiverReplacementCatalog, replaceReceiverReviewItems, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test('both segmentation engines preserve question, negation and original positions through assisted recovery', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
      for (const text of ['你要不要喝水？', '饭太凉了，请热一下。', '不要再热了', '我今晚不回家吃饭']) {
        const session = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
        expect(session.reviewItems.map(item => item.token).join('')).toBe(text)
        const next = replaceReceiverReviewItems(session, prepareReceiverAssistedItems(session.reviewItems))
        const meaning = buildReceiverMeaningAssessment(text, next.reviewItems)
        expect(meaning.requiresAssistance).toBe(true)
        expect(meaning.unresolvedMeaningItems.every(item => !/^[，。？]+$/.test(item.token))).toBe(true)
        const entry = { ...buildConfirmedReceiverHistory(next)!, id: 'synthetic-meaning', recordStatus: 'draft' as const }
        const restored = restoreReceiverWorkspaceFromRecord(entry, DEFAULT_BOARD_FIXTURES)!
        expect(restored.session.inputText).toBe(text)
        expect(buildReceiverMeaningAssessment(text, restored.session.reviewItems).requiresAssistance).toBe(true)
        expect(restored.session.outputPreview.map(item => item.label)).toEqual(next.outputPreview.map(item => item.label))
      }
    }
  } finally { if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor) }
})

test('packaged public candidates retain source identity and do not create automatic meal synonyms', () => {
  const catalog = getReceiverReplacementCatalog(DEFAULT_BOARD_FIXTURES)
  expect(getLocalPictogramCandidates('饭', catalog)[0]).toMatchObject({ relation: 'narrower', sourceId: 'mulberry:rice.svg' })
  expect(getLocalPictogramCandidates('热一下', catalog)[0].sourceId).toBe('mulberry:heat_,_to.svg')
  expect(getLocalPictogramCandidates('鸡蛋', catalog).map(item => item.relation)).toEqual(['equivalent', 'narrower'])
  expect(runReceiverSession('饭', DEFAULT_BOARD_FIXTURES).reviewItems[0].tile).toBeNull()
})
