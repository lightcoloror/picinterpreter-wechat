import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { captureWechatStorage, restoreWechatStorage, captureWechatStorageSource, restoreWechatStorageSource } from './weapp-e2e-storage.mjs'

function runtime(entries) {
  const data = new Map(entries)
  const wx = {
    getStorageInfoSync: () => ({ keys: [...data.keys()] }),
    getStorageSync: key => data.get(key),
    removeStorageSync: key => data.delete(key),
    setStorageSync: (key, value) => data.set(key, value)
  }
  const call = (fn, args = []) => vm.runInNewContext(`(${fn === captureWechatStorage ? captureWechatStorageSource : restoreWechatStorageSource})(...args)`, { wx, args })
  return { data, wx, call }
}

test('batches preserve all typed synthetic storage and remove only test-time additions', () => {
  const original = [['text', '0'], ['number', 0], ['boolean', false], ['object', { a: [1, null, '患者合成资料'] }]]
  const state = runtime(original)
  const snapshot = state.call(captureWechatStorage)
  assert.equal(JSON.stringify(snapshot), JSON.stringify(original))
  state.data.set('test-added', 'temporary')
  state.data.set('text', 'changed')
  assert.equal(state.call(restoreWechatStorage, [snapshot]), original.length)
  assert.equal(JSON.stringify(state.call(captureWechatStorage)), JSON.stringify(original))
})

test('empty snapshots restore an originally empty test store', () => {
  const state = runtime([['temporary', 1]])
  assert.equal(state.call(restoreWechatStorage, [[]]), 0)
  assert.equal(state.data.size, 0)
})

test('write failure is surfaced instead of reporting successful restoration', () => {
  const state = runtime([['test-added', 1]])
  const original = [['first', 1], ['second', 2]]
  state.wx.setStorageSync = () => { throw new Error('synthetic storage failure') }
  assert.throws(() => state.call(restoreWechatStorage, [original]), /synthetic storage failure/)
  assert.equal(JSON.stringify(original), '[["first",1],["second",2]]')
})

test('uses the CLI-compatible anonymous single-line callback format', () => {
  for (const source of [captureWechatStorageSource, restoreWechatStorageSource]) {
    assert.match(source, /^function\(/)
    assert.equal(source.includes('\n'), false)
    assert.equal(source.includes('=>'), false)
  }
})
