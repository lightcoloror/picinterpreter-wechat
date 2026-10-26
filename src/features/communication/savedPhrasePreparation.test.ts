import { expect, test } from 'vitest'
import { SAVED_PHRASE_STARTERS, createSavedPhrasePreparationService } from '@cboard-communication-core/savedPhrasePreparation'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each(SAVED_PHRASE_STARTERS)('mini $id prepares, reviews, saves and reopens quietly using existing adapter', template => {
  const values = new Map<string, unknown>()
  const open = () => createWechatCommunicationRepository({ getStorageSync: key => values.get(key) ?? '',
    setStorageSync: (key, value) => { values.set(key, value) }, removeStorageSync: key => { values.delete(key) } })
  const repo = open(), service = createSavedPhrasePreparationService({ repository: repo })
  const draft = service.start(template.id)
  expect(draft.output).toEqual([])
  let session = runReceiverSession(template.text, DEFAULT_BOARD_FIXTURES)
  session.reviewItems.filter(item => !item.tile || ['partial', 'none', 'missing'].includes(item.matchType)).forEach(item => {
    session = retainReceiverItemAsText(session, item.id)
  })
  const entry = buildConfirmedReceiverHistory(session)!
  expect(entry).toBeTruthy()
  service.update(draft.id, entry)
  const restored = restoreReceiverWorkspaceFromRecord(open().loadSavedPhrasePreparation(), DEFAULT_BOARD_FIXTURES)!
  expect(restored.session.inputText).toBe(template.text)
  const content = (items: typeof session.outputPreview) => items.map(item => item.textOnly ? { ...item, id: '' } : item)
  expect(content(restored.session.outputPreview)).toEqual(content(session.outputPreview))
  const result = service.commit(draft.id, entry)
  expect(result.ok).toBe(true)
  expect(service.commit(draft.id, entry).item?.id).toBe(result.item?.id)
  const reopened = open()
  expect(reopened.loadCommunicationSavedPhrases()).toHaveLength(1)
  expect(reopened.loadCommunicationSavedPhrases()[0].lifeContext).toBe(template.lifeContext)
  expect(reopened.loadReceiverRecords()).toEqual([])
  expect(reopened.loadCommunicationHistory()).toEqual([])
})
