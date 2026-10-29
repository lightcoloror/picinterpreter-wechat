import { beforeEach, expect, test, vi } from 'vitest'
import LaunchPage from './index'

const h = vi.hoisted(() => ({ values: [] as any[], index: 0, show: null as any, hide: null as any,
  who: { id: 'synthetic-account', token: 'synthetic-token' }, request: vi.fn(), redirect: vi.fn(),
  save: vi.fn(), start: vi.fn(), sync: vi.fn(async () => undefined) }))
vi.mock('react', () => ({ useState: (initial: any) => {
  const index = h.index++; if (!(index in h.values)) h.values[index] = initial
  return [h.values[index], (value: any) => { h.values[index] = value }]
}, useRef: (initial: any) => {
  const index = h.index++; if (!(index in h.values)) h.values[index] = { current: initial }
  return h.values[index]
} }))
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Button: 'Button' }))
vi.mock('@tarojs/taro', () => ({ default: { redirectTo: h.redirect }, useDidShow: (fn: any) => { h.show = fn }, useDidHide: (fn: any) => { h.hide = fn } }))
vi.mock('../../platform/taroCareRuntime', () => ({ runtime: { enabled: true, identity: () => h.who, request: h.request, newId: async () => 'synthetic-operation' } }))
vi.mock('../../platform/taroCareContext', () => ({ currentCareContext: () => null, saveCareSelection: h.save }))
vi.mock('../../platform/taroCareWorkspace', () => ({ startCareWorkspace: h.start, synchronizeCareWorkspace: h.sync }))
const profile = { id: 'B', familyId: 'synthetic-family', relationship: { role: 'relative', defaultMode: 'receiver' } }
const render = () => { h.index = 0; return LaunchPage() }
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
beforeEach(() => { h.values = []; h.index = 0; h.who = { id: 'synthetic-account', token: 'synthetic-token' }; vi.clearAllMocks() })

test('launch restores the GET selection without PUT, speech or generating candidates', async () => {
  h.request.mockImplementation(async path => path === '/care/profiles' ? [profile] : { selectedProfileId: 'B', selectionVersion: 8 })
  render(); h.show(); await settle()
  expect(h.request.mock.calls).toEqual([['/care/profiles', 'GET'], ['/care/context', 'GET']])
  expect(h.save).toHaveBeenCalledWith(profile)
  expect(h.redirect).toHaveBeenCalledOnce()
})

test.each(['hide', 'token', 'account'])('a delayed startup GET cannot enter after %s changes', async kind => {
  let release!: (value: any) => void
  h.request.mockImplementation(async path => path === '/care/profiles' ? [profile] : new Promise(resolve => { release = resolve }))
  render(); h.show(); await settle()
  if (kind === 'hide') h.hide()
  if (kind === 'token') h.who = { ...h.who, token: 'replacement-token' }
  if (kind === 'account') h.who = { ...h.who, id: 'synthetic-second' }
  release({ selectedProfileId: 'B', selectionVersion: 8 }); await settle()
  expect(h.save).not.toHaveBeenCalled()
  expect(h.start).not.toHaveBeenCalled()
  expect(h.redirect).not.toHaveBeenCalled()
  expect(h.request.mock.calls.filter(c => c[1] === 'PUT')).toEqual([])
})

test('a late first startup response cannot replace the newer restored selection', async () => {
  let release!: (value: any) => void, gets = 0
  h.request.mockImplementation(async path => {
    if (path === '/care/profiles') return [profile, { ...profile, id: 'A' }]
    if (++gets === 1) return new Promise(resolve => { release = resolve })
    return { selectedProfileId: 'B', selectionVersion: 8 }
  })
  render(); h.show(); await settle(); h.hide(); h.show(); await settle()
  release({ selectedProfileId: 'A', selectionVersion: 7 }); await settle()
  expect(h.save.mock.calls).toEqual([[profile]])
  expect(h.redirect).toHaveBeenCalledOnce()
  expect(h.request.mock.calls.filter(c => c[1] === 'PUT')).toEqual([])
})
