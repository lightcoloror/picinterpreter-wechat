import { expect, test } from 'vitest'
import { createCommunicationRepository } from '@cboard-communication-core/repository'
import { buildReceiverReading } from '@cboard-communication-core/receiverReading'
import { getReceiverRepairSource, withReceiverRepair } from '@cboard-communication-core/receiverRepair'
import { createReceiverWorkspaceResumeState, runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, resumeReceiverWorkspaceAfterDisplay, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test('mini receiver adapter repairs, confirms and reopens offline with original positions and no implicit playback', () => {
  const values = new Map<string, string>(); let id = 0, time = 1
  const open = () => createCommunicationRepository({ storage: {
    getItem: key => values.get(key) || null, setItem: (key, value) => { values.set(key, value) }
  }, now: () => time++, createId: prefix => `${prefix}-${++id}` })
  const repo = open(), raw = '我今晚不回家吃饭，明早七点半回家'
  let session = runReceiverSession(raw, [])
  session.reviewItems.filter(item => !item.tile).forEach(item => { session = retainReceiverItemAsText(session, item.id) })
  const entry = buildConfirmedReceiverHistory(session)!
  const source = repo.confirmReceiverDraft(repo.createReceiverDraft(entry), entry)
  repo.recordReceiverPatientFeedback(source.id, 'not_understood')
  const resume = resumeReceiverWorkspaceAfterDisplay(createReceiverWorkspaceResumeState({ session, segmentationDraft: raw, activeDraft: source, learnFromCorrections: false }), { feedback: 'not_understood', saved: true })
  expect(resume.repairSource?.id).toBe(source.id)
  expect(resume.repairRequested).toBe(true)
  const draft = repo.createReceiverDraft(withReceiverRepair(entry, source))
  const reopened = open(), restored = reopened.loadResumableReceiverRecord()!
  expect(getReceiverRepairSource(restored, reopened.loadReceiverRecords())?.id).toBe(source.id)
  const workspace = restoreReceiverWorkspaceFromRecord(restored, [])!
  const reading = buildReceiverReading(workspace.session.inputText, restored.pictogramSequence, workspace.session.outputPreview)
  expect(reading.segments.map(item => item.text)).toEqual(['我今晚不回家吃饭，', '明早七点半回家'])
  const confirmed = reopened.confirmReceiverDraft(draft, entry)
  expect(confirmed.repairOfRecordId).toBe(source.id)
  expect(reopened.loadCommunicationHistory()).toHaveLength(2)
  const understood = resumeReceiverWorkspaceAfterDisplay({ ...resume, activeDraft: confirmed }, { feedback: 'understood', saved: true })
  expect(understood.repairRequested).toBe(false)
  expect(understood.repairSource).toBeNull()
})
