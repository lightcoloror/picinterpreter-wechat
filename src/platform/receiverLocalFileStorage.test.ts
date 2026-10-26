import { expect, test, vi } from 'vitest'
import { createReceiverLocalFileStorage, RECEIVER_LOCAL_KEYS as K } from './receiverLocalFileStorage'

function fixture() {
  const disk = new Map<string, string>(), kv = new Map<string, unknown>()
  let scope = 'synthetic-a', fault = '', readFailure = false
  const files = {
    readFileSync(path: string) {
      if (readFailure && !path.endsWith('.tmp') && !path.includes('cleared')) { readFailure = false; throw new Error('readback failed') }
      if (!disk.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return disk.get(path)!
    },
    writeFileSync(path: string, value: string) {
      if (fault === 'write') throw new Error('write failed')
      if (fault !== 'silent') disk.set(path, value)
    },
    renameSync(from: string, to: string) {
      if (fault === 'rename') throw new Error('rename failed')
      disk.set(to, disk.get(from)!); disk.delete(from)
      if (fault === 'readback') readFailure = true
      if (fault === 'scope') scope = 'synthetic-b'
    },
    readdirSync: () => [...disk.keys()].map(path => path.split('/').pop()!)
  }
  const legacy = { getStorageSync: vi.fn((key: string) => kv.get(key)) }
  const make = () => createReceiverLocalFileStorage({ rootPath: '/synthetic', files, legacy,
    getScopeKey: () => scope, newGeneration: () => 'a'.repeat(64) })
  return { make, disk, kv, legacy, fault: (next: string) => { fault = next },
    scope: (next: string) => { scope = next }, final: () => [...disk.keys()].find(p => p.endsWith('.json') && !p.includes('cleared'))! }
}

test('migrates exactly the receiver/preparation keys once; stale KV cannot win on recreation', () => {
  const f = fixture(); f.kv.set(K[0], '[{"id":"synthetic-old"}]')
  f.make().setStorageSync(K[0], '[{"id":"synthetic-new","inputText":"我今晚不回家吃饭"}]')
  expect(f.legacy.getStorageSync.mock.calls.map(x => x[0])).toEqual([...K])
  expect(f.make().getStorageSync(K[0])).toContain('synthetic-new')
  expect(f.make().handles('cboard_communication_saved_phrases')).toBe(false)
  expect(f.make().handles('cboard_communication_history')).toBe(false)
})
test.each(['write', 'silent', 'rename'])('%s fails without changing last valid file; retry works', fault => {
  const f = fixture(); f.make().setStorageSync(K[3], '{"scope":{"inputText":"旧句"}}')
  const before = f.disk.get(f.final()); f.fault(fault)
  expect(() => f.make().setStorageSync(K[3], '{"scope":{"inputText":"新句"}}')).toThrow()
  expect(f.disk.get(f.final())).toBe(before)
  f.fault(''); f.make().setStorageSync(K[3], '{"scope":{"inputText":"新句"}}')
  expect(f.make().getStorageSync(K[3])).toContain('新句')
})
test('post-write readback failure is reported, then exact actual content can be read', () => {
  const f = fixture(); f.make().setStorageSync(K[3], '{}'); f.fault('readback')
  expect(() => f.make().setStorageSync(K[3], '{"scope":{}}')).toThrow('readback')
  f.fault(''); expect(f.make().getStorageSync(K[3])).toBe('{"scope":{}}')
})
test.each(['corrupt', 'future', 'scope'])('%s authoritative file never falls back to KV', fault => {
  const f = fixture(); f.make().setStorageSync(K[3], '{}')
  const path = f.final(), raw = f.disk.get(path)!
  f.disk.set(path, fault === 'corrupt' ? '{bad' : fault === 'future' ? raw.replace('"version":1', '"version":2') : raw.replace(/"scopeHash":"[^"]+"/, '"scopeHash":"other"'))
  expect(() => f.make().getStorageSync(K[3])).toThrow()
  expect(f.legacy.getStorageSync).toHaveBeenCalledTimes(5)
})
test('cleanup barrier prevents stale KV and orphan tmp restoration without deleting unrelated media', () => {
  const f = fixture(); f.kv.set(K[3], '{"scope":{"inputText":"synthetic-private"}}'); f.make().getStorageSync(K[3])
  f.disk.set(f.final() + '.tmp', 'synthetic-private'); f.disk.set('/synthetic/personal-photo.png', 'keep')
  f.make().clearAllScopes(); f.scope('synthetic-unmigrated')
  expect(f.make().getStorageSync(K[3])).toBeNull()
  expect([...f.disk.values()].join()).not.toContain('synthetic-private')
  expect(f.disk.get('/synthetic/personal-photo.png')).toBe('keep')
})
