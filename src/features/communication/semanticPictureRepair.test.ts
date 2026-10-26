import { expect, test } from 'vitest'
import { matchTextToCommunicationTiles } from '@cboard-communication-core/symbolMatching'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test('packaged fork remains cutlery rather than a branching road', () => {
  const result = matchTextToCommunicationTiles('路在前面分叉', DEFAULT_BOARD_FIXTURES, { allowPartial: false })
  expect(result.matches.find(m => m.token === '分叉')?.tile).toBeNull()
  const cutlery = matchTextToCommunicationTiles('餐叉', DEFAULT_BOARD_FIXTURES, { preSegmented:['餐叉'], allowPartial:false })
  expect(cutlery.matches[0].tile?.displayLabel).toBe('叉子')
})

test('packaged defaults do not map permission to the tin-can object', () => {
  const result = matchTextToCommunicationTiles('可以', DEFAULT_BOARD_FIXTURES, { preSegmented: ['可以'], allowPartial: false })
  expect(result.matches[0].tile?.id).not.toBe('pi-core-can')
  const noun = matchTextToCommunicationTiles('罐头', DEFAULT_BOARD_FIXTURES, { preSegmented: ['罐头'], allowPartial: false })
  expect(noun.matches[0].tile?.displayLabel).toBe('罐头')
})

test.each(['我不开心', '先吃药再喝水', '可以等，不能走'])('retains unresolved meaning through mini-program save and restart: %s', text => {
  let state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
  expect(state.reviewItems.map(m => m.token).join('')).toBe(text)
  expect(state.reviewItems.some(m => m.token === '吃药' && m.tile?.displayLabel === '药')).toBe(false)
  expect(state.reviewItems.some(m => m.token === '不开心' && m.tile?.displayLabel === '伤心')).toBe(false)
  state.reviewItems.filter(m => !m.tile).forEach(m => { state = retainReceiverItemAsText(state, m.id) })
  const history = buildConfirmedReceiverHistory(state)!
  const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'synthetic-semantic-repair', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
  expect(restored.session.outputPreview.map(m => m.vocalization).join('')).toBe(text)
})
