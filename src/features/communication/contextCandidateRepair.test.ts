import { expect, test } from 'vitest'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { buildPictogramSemantics, rankPictogramCandidates } from '@cboard-communication-core/pictogramSemantics'
import { runReceiverSession, refreshReceiverMissingItems, retainReceiverItemAsText,
  buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each([
  ['饭太凉了，请热一下。', '热一下'],
  ['小岚不去，小林陪我去。', '小岚'],
  ['轮椅的刹车还没松开。', '刹车']
])('mini adapter preserves the expression without fragment images: %s', (text, unit) => {
  const state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
  expect(state.segments).toContain(unit)
  expect(state.segments.join('')).toBe(text)
  expect(state.reviewItems.find(i => i.token === unit)!.tile).toBeNull()
})

test('mini presegmented heating and negative names use the shared occurrence guard', () => {
  for (const [text, tokens, blocked] of [
    ['水热一下', ['水', '热', '一下'], '热'],
    ['小岚不去', ['小', '岚', '不', '去'], '小']
  ] as [string, string[], string][]) {
    const state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES, { preSegmented: tokens })
    expect(state.reviewItems.find(i => i.token === blocked)!.tile).toBeNull()
  }
})

const picture = (token: string, id: number, labels: string[]) => ({
  id: `runtime_${id}`, image: 'data:image/png;base64,c3ludGhldGlj', label: labels[0],
  source: { provider: 'arasaac', originalId: String(id), name: 'ARASAAC', license: 'CC BY-NC-SA 4.0', sourceUrl: `https://arasaac.org/pictograms/${id}` },
  semantics: buildPictogramSemantics({ token, query: token, provider: 'arasaac', originalId: String(id), sourceLabels: labels })
})

test('filtered candidates use existing confirmation and offline repository/receiver restoration', () => {
  expect(rankPictogramCandidates('停车场', [picture('停车场', 5379, ['停车场']), picture('停车场', 6283, ['停车场'])]).map(p => p.source.originalId)).toEqual(['6283'])
  expect(rankPictogramCandidates('请帮忙', [picture('请帮忙', 25620, ['help']), picture('请帮忙', 4570, ['help', 'aid'])]).map(p => p.source.originalId)).toEqual(['4570'])
  const values = new Map<string, unknown>()
  const storage = { getStorageSync: (key: string) => values.get(key) ?? '', setStorageSync: (key: string, value: unknown) => { values.set(key, JSON.parse(JSON.stringify(value))) } }
  const repo = createWechatCommunicationRepository(storage)
  const text = '轮椅的刹车还没松开。'
  const [record] = repo.recordMissingTokens({ tokens: ['刹车'], rawText: text })
  const p = picture('刹车', 37920, ['刹车'])
  repo.reviewMissingToken(record.id, { status: 'suggested', suggestedPictograms: [p] } as any)
  expect(refreshReceiverMissingItems(runReceiverSession(text, DEFAULT_BOARD_FIXTURES), DEFAULT_BOARD_FIXTURES, repo.loadMissingTokens()).reviewItems.find(i => i.token === '刹车')!.tile).toBeNull()
  repo.reviewMissingToken(record.id, { status: 'resolved', resolvedPictogramId: p.id, reviewedByCaregiver: true })
  let state = refreshReceiverMissingItems(runReceiverSession(text, DEFAULT_BOARD_FIXTURES), DEFAULT_BOARD_FIXTURES, createWechatCommunicationRepository(storage).loadMissingTokens())
  expect(state.reviewItems.find(i => i.token === '刹车')!.tile!.tile.image).toBe(p.image)
  for (const item of state.reviewItems.filter(i => !i.tile)) state = retainReceiverItemAsText(state, item.id)
  const saved = JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(state)))
  const restored = restoreReceiverWorkspaceFromRecord(saved, [])!.session
  expect(restored.outputPreview.map(i => i.vocalization).join('')).toBe(text)
  expect(restored.reviewItems.find(i => i.token === '刹车')!.tile!.tile.image).toBe(p.image)
})
