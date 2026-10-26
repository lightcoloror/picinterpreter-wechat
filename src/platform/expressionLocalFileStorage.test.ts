import { expect, test, vi } from 'vitest'
import { createExpressionDraftService } from '@cboard-communication-core/expressionDraft'
import { buildExpressionHistoryEntry, buildExpressionLoopStateFromSavedPhrase } from '@cboard-communication-core/expressionPipeline'
import { createWechatCommunicationRepository } from './communicationRepository'
import { createExpressionLocalFileStorage, EXPRESSION_LOCAL_KEYS, EXPRESSION_LOCAL_CLEAR_FILE, isExpressionLocalFileName } from './expressionLocalFileStorage'

const [draftKey, historyKey, legacyHistoryKey, patientKey, workspaceKey] = EXPRESSION_LOCAL_KEYS
function fixture() {
  const disk = new Map<string, string>(), kv = new Map<string, unknown>()
  let scope = 'synthetic-scope-a', fault = '', failConfirmed = false, failRead = 0
  const files = {
    readFileSync(path: string) {
      if (fault === 'permission') throw Object.assign(new Error('permission'), { code: 'EACCES' })
      if (failRead > 0 && path.endsWith('.json') && !path.includes('cleared-v1')) {
        failRead--; throw new Error('readback unavailable')
      }
      if (!disk.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return disk.get(path)!
    },
    writeFileSync(path: string, text: string) {
      if (fault === 'write' || (failConfirmed && text.includes('\\"status\\":\\"confirmed\\"'))) throw new Error('write failed')
      if (fault === 'silent') return
      disk.set(path, text)
      if (fault === 'scope') scope = 'synthetic-scope-b'
    },
    renameSync(from: string, to: string) {
      if (fault === 'rename') throw new Error('rename failed')
      disk.set(to, disk.get(from)!); disk.delete(from)
      if (fault === 'readback') failRead = 1
    },
    readdirSync: () => [...disk.keys()].map(path => path.split('/').pop()!)
  }
  const legacy = { getStorageSync: vi.fn((key: string) => kv.get(key)) }
  const make = () => createExpressionLocalFileStorage({
    rootPath: '/synthetic', files, legacy, getScopeKey: () => scope, newGeneration: () => 'a'.repeat(64)
  })
  const repository = () => {
    const storage = make()
    return createWechatCommunicationRepository({
      getStorageSync: key => storage.handles(key) ? storage.getStorageSync(key) : kv.get(key),
      setStorageSync: (key, value) => { if (storage.handles(key)) storage.setStorageSync(key, value); else kv.set(key, value) },
      removeStorageSync: key => { if (storage.handles(key)) storage.removeStorageSync(key); else kv.delete(key) }
    })
  }
  return { disk, kv, files, legacy, make, repository,
    fault: (value: string) => { fault = value }, scope: (value: string) => { scope = value },
    failConfirmed: (value: boolean) => { failConfirmed = value },
    final: () => [...disk.keys()].find(path => path.endsWith('.json') && !path.includes('cleared-v1'))!
  }
}

test('one-time migration reads exactly five keys, then file authority survives rolled-back KV and recreation', () => {
  const f = fixture()
  f.kv.set(draftKey, '{"synthetic":{"revision":1}}')
  f.kv.set(historyKey, '[{"id":"synthetic-history"}]')
  f.kv.set(patientKey, 'synthetic-patient'); f.kv.set(workspaceKey, 'synthetic-workspace')
  const storage = f.make()
  expect(storage.getStorageSync(draftKey)).toContain('revision')
  expect(f.legacy.getStorageSync.mock.calls.map(call => call[0])).toEqual([...EXPRESSION_LOCAL_KEYS])
  storage.setStorageSync(draftKey, '{"synthetic":{"revision":3,"rejected":true}}')
  f.kv.set(draftKey, '{"synthetic":{"revision":1}}')
  expect(f.make().getStorageSync(draftKey)).toContain('"revision":3')
  expect(f.legacy.getStorageSync).toHaveBeenCalledTimes(5)
  expect(f.make().getStorageSync(patientKey)).toBe('synthetic-patient')
  expect(f.make().getStorageSync(workspaceKey)).toBe('synthetic-workspace')
})

test.each(['write', 'silent', 'rename'])('migration %s failure never claims success or changes legacy', fault => {
  const f = fixture(); f.kv.set(draftKey, '{"synthetic":{}}'); f.fault(fault)
  expect(() => f.make().getStorageSync(draftKey)).toThrow()
  expect(f.kv.get(draftKey)).toBe('{"synthetic":{}}')
  expect(f.final()).toBeUndefined()
  f.fault(''); expect(f.make().getStorageSync(draftKey)).toBe('{"synthetic":{}}')
})

test.each(['write', 'silent', 'rename'])('existing %s failure preserves the previous authoritative draft and supports retry', fault => {
  const f = fixture(), storage = f.make()
  storage.setStorageSync(draftKey, '{"synthetic":{"revision":1}}')
  const original = f.disk.get(f.final())
  f.fault(fault)
  expect(() => storage.setStorageSync(draftKey, '{"synthetic":{"revision":2}}')).toThrow()
  expect(f.disk.get(f.final())).toBe(original)
  f.fault(''); storage.setStorageSync(draftKey, '{"synthetic":{"revision":2}}')
  expect(f.make().getStorageSync(draftKey)).toContain('"revision":2')
})

test('failed final readback reports failure despite successful rename; recreation sees new authoritative value', () => {
  const f = fixture(), storage = f.make()
  storage.setStorageSync(draftKey, '{}'); f.fault('readback')
  expect(() => storage.setStorageSync(draftKey, '{"synthetic":{"revision":2}}')).toThrow('readback unavailable')
  f.fault(''); expect(f.make().getStorageSync(draftKey)).toContain('"revision":2')
})

test.each(['corrupt', 'permission', 'wrong-scope', 'old-version'])('existing %s file never falls back to old KV', fault => {
  const f = fixture(); f.make().setStorageSync(draftKey, '{}')
  const path = f.final(), original = f.disk.get(path)!
  if (fault === 'corrupt') f.disk.set(path, '{bad')
  if (fault === 'wrong-scope') f.disk.set(path, original.replace(/"scopeHash":"[a-f0-9]+"/, '"scopeHash":"other"'))
  if (fault === 'old-version') f.disk.set(path, original.replace('"version":1', '"version":0'))
  if (fault === 'permission') f.fault('permission')
  const calls = f.legacy.getStorageSync.mock.calls.length
  expect(() => f.make().getStorageSync(draftKey)).toThrow()
  expect(f.legacy.getStorageSync).toHaveBeenCalledTimes(calls)
})

test('scope switch during verified write rejects success and does not write the new scope', () => {
  const f = fixture(); f.make().setStorageSync(draftKey, '{}'); f.fault('scope')
  expect(() => f.make().setStorageSync(draftKey, '{"synthetic":{}}')).toThrow('档案已切换')
  f.fault(''); expect(f.make().getStorageSync(draftKey)).toBeNull()
  f.scope('synthetic-scope-a'); expect(f.make().getStorageSync(draftKey)).toBe('{"synthetic":{}}')
})

test('privacy clearing overwrites final and orphan temp content, blocks stale KV and keeps unrelated files', () => {
  const f = fixture(); f.kv.set(draftKey, '{"synthetic":{"private":"synthetic-only"}}')
  f.make().getStorageSync(draftKey)
  const original = f.final()
  f.disk.set(`${original}.tmp`, 'synthetic private partial')
  f.disk.set(`/synthetic/picinterpreter-expression-local-${'b'.repeat(64)}.json.tmp`, 'synthetic orphan')
  f.disk.set('/synthetic/unrelated.json', 'keep')
  f.make().clearAllScopes()
  expect(f.make().getStorageSync(draftKey)).toBeNull()
  expect([...f.disk.values()].join()).not.toContain('synthetic-only')
  expect([...f.disk.keys()].filter(path => path.endsWith('.tmp'))).toEqual([])
  expect(f.disk.get('/synthetic/unrelated.json')).toBe('keep')
  f.scope('synthetic-unmigrated'); expect(f.make().getStorageSync(draftKey)).toBeNull()
  expect(JSON.parse(f.disk.get(`/synthetic/${EXPRESSION_LOCAL_CLEAR_FILE}`)!)).toMatchObject({ denyLegacyMigration: true })
  expect(isExpressionLocalFileName(original.split('/').pop()!)).toBe(true)
  expect(isExpressionLocalFileName(`${EXPRESSION_LOCAL_CLEAR_FILE}.tmp`)).toBe(true)
})

test('privacy marker survives interrupted scope cleanup and prevents content resurrection', () => {
  const f = fixture(); f.make().setStorageSync(draftKey, '{"synthetic":{"private":"synthetic-only"}}')
  const rename = f.files.renameSync
  f.files.renameSync = (from, to) => {
    if (!to.includes('cleared-v1')) throw new Error('cleanup failed')
    rename(from, to)
  }
  expect(() => f.make().clearAllScopes()).toThrow('cleanup failed')
  f.files.renameSync = rename
  expect(f.make().getStorageSync(draftKey)).toBeNull()
  expect(f.disk.get(f.final())).not.toContain('synthetic-only')
})

test('guest identity and exact ordered draft persist together without any KV flush', () => {
  const f = fixture(), repo = f.repository(), identity = repo.loadCommunicationIdentity()
  const pipeline = buildExpressionLoopStateFromSavedPhrase({ sentence: '我今晚不回家吃饭', output: [] })
  const s = createExpressionDraftService({ repository: repo, getScopeKey: () => 'synthetic' })
  const saved = s.save({ pipeline, rejected: true, candidateFeedbackEntries: [] })
  f.kv.clear()
  const restarted = f.repository()
  expect(restarted.loadCommunicationIdentity()).toEqual(identity)
  expect(createExpressionDraftService({ repository: restarted, getScopeKey: () => 'synthetic' }).load()).toEqual(saved)
})

test('history and confirmed marker use durable envelope; interruption retries without duplicate history', () => {
  const f = fixture(), repo = f.repository()
  const pipeline = buildExpressionLoopStateFromSavedPhrase({ sentence: '我今晚不回家吃饭', output: [] })
  const s = createExpressionDraftService({ repository: repo, getScopeKey: () => 'synthetic' })
  s.save({ pipeline })
  const entry = buildExpressionHistoryEntry(pipeline)
  f.failConfirmed(true)
  expect(() => s.confirm(entry)).toThrow()
  expect(repo.loadCommunicationHistory()).toHaveLength(1)
  const prior = repo.loadCommunicationHistory()
  f.failConfirmed(false); f.kv.clear()
  const coldRepo = f.repository(), cold = createExpressionDraftService({ repository: coldRepo, getScopeKey: () => 'synthetic' })
  expect(cold.load()?.status).toBe('draft')
  cold.confirm(entry); cold.confirm(entry)
  expect(coldRepo.loadCommunicationHistory()).toEqual(prior)
  expect(cold.getCurrent()?.status).toBe('confirmed')
  const envelope = JSON.parse(f.disk.get(f.final())!)
  expect(envelope.values[historyKey]).toBeTruthy()
  expect(envelope.values[legacyHistoryKey]).toBeTruthy()
})
