import { expect, test, vi } from 'vitest'
import { createFavoriteLocalFileStorage, FAVORITE_LOCAL_KEYS as K } from './favoriteLocalFileStorage'

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
  const make = () => createFavoriteLocalFileStorage({ rootPath: '/synthetic', files, legacy,
    getScopeKey: () => scope, newGeneration: () => 'a'.repeat(64) })
  return { make, disk, kv, legacy, fault: (next: string) => { fault = next },
    scope: (next: string) => { scope = next }, final: () => [...disk.keys()].find(p => p.endsWith('.json') && !p.includes('cleared'))! }
}

test('all five keys migrate once and stale legacy cannot override canonical deletion', () => {
  const f = fixture(); f.kv.set(K[1], '[]'); f.kv.set(K[3], '[{"id":"stale"}]')
  const raw = JSON.stringify({ version:1, scope:'synthetic-a', generation:'synthetic', revision:2, phrases:[], tombstones:[{id:'old',deletedAt:1}], pending:{items:[],base:[]} })
  f.make().setStorageSync(K[0],raw)
  expect(f.make().getStorageSync(K[0])).toBe(raw)
  expect(f.legacy.getStorageSync).toHaveBeenCalledTimes(5)
})
test.each(['write','silent','rename'])('%s retains previous valid favorite file', fault => {
  const f=fixture(); f.make().setStorageSync(K[1],'[]'); const old=f.disk.get(f.final()); f.fault(fault)
  expect(()=>f.make().setStorageSync(K[1],'[{"id":"synthetic"}]')).toThrow()
  expect(f.disk.get(f.final())).toBe(old)
  f.fault(''); f.make().setStorageSync(K[1],'[{"id":"synthetic"}]')
  expect(f.make().getStorageSync(K[1])).toContain('synthetic')
})
test('clear barrier rejects legacy on a previously unopened scope and preserves unrelated photos',()=>{
  const f=fixture();f.kv.set(K[1],'[{"id":"private"}]');f.make().getStorageSync(K[1]);
  f.disk.set('/synthetic/photo.png','keep');f.make().clearAllScopes();f.scope('new')
  expect(f.make().getStorageSync(K[1])).toBeNull();expect(f.disk.get('/synthetic/photo.png')).toBe('keep')
})
test.each(['corrupt','future','scope'])('%s file remains protected', fault=>{
  const f=fixture();f.make().setStorageSync(K[1],'[]');const path=f.final(),raw=f.disk.get(path)!
  const damaged=fault==='corrupt'?'{broken':fault==='future'?raw.replace('"version":1','"version":9'):raw.replace(/"scopeHash":"[^"]+"/,'"scopeHash":"other"')
  f.disk.set(path,damaged);expect(()=>f.make().getStorageSync(K[1])).toThrow();expect(f.disk.get(path)).toBe(damaged)
})
