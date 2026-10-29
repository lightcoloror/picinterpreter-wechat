import { afterEach, expect, test, vi } from 'vitest'
import { runtime } from './taroCareRuntime'

const h = vi.hoisted(() => ({
  account: 'first',
  token: 'synthetic',
  save: vi.fn(),
  clear: vi.fn(),
  request: vi.fn(),
  navigateBack: vi.fn(),
  redirectTo: vi.fn(),
  apiBase: ''
}))
vi.mock('@tarojs/taro', () => ({ default: { request: h.request, navigateBack: h.navigateBack, redirectTo: h.redirectTo } }))
vi.mock('./taroCboardAccountPort', () => ({ taroCboardSessionStore: {
  load: () => h.account ? { user: { id: h.account }, token: h.token } : null,
  clear: h.clear
} }))
vi.mock('./taroCareContext', () => ({ saveCareSelection: h.save }))
vi.mock('./taroSpeechPort', () => ({ wechatSpeechPort: {} }))
vi.mock('../config/runtimeCapabilities', () => ({ apiBaseUrlFor: () => h.apiBase }))

const profile = { id: 'patient', familyId: 'family' }
test('AI funding follows the configured AI capability, independent of care access', () => {
  expect(runtime.fundingEnabled).toBe(false)
})
afterEach(() => {
  vi.restoreAllMocks()
  h.save.mockClear()
  h.clear.mockClear()
  h.request.mockReset()
  h.navigateBack.mockReset()
  h.redirectTo.mockReset()
  h.account = 'first'
  h.token = 'synthetic'
  h.apiBase = ''
})
test('anonymous Care navigation redirects to the existing account page', async () => {
  await runtime.openAccount()
  expect(h.redirectTo).toHaveBeenCalledWith({ url: '/packages/management/pages/index/index' })
  expect(h.navigateBack).not.toHaveBeenCalled()
  expect(h.clear).not.toHaveBeenCalled()
})
test.each([false, true])('settings cannot save a prior account selection after an asynchronous response (network failure=%s)', async offline => {
  vi.spyOn(runtime, 'request').mockImplementation(async () => {
    h.account = 'second'
    if (offline) throw new Error('offline')
    return {}
  })
  await expect(runtime.selectProfile(profile)).rejects.toMatchObject({ status: 401 })
  expect(h.save).not.toHaveBeenCalled()
})
test('the unchanged account can select cached data on network failure', async () => {
  vi.spyOn(runtime, 'request').mockRejectedValue(new Error('offline'))
  await runtime.selectProfile(profile)
  expect(h.save).toHaveBeenCalledWith(profile)
})
test('a replaced token cannot save the previous session profile relationship', async () => {
  vi.spyOn(runtime, 'request').mockImplementation(async () => { h.token = 'replacement'; return {} })
  await expect(runtime.selectProfile(profile)).rejects.toMatchObject({ status: 401 })
  expect(h.save).not.toHaveBeenCalled()
})
test('logged out settings cannot send a selection request', async () => {
  h.account = ''
  const request = vi.spyOn(runtime, 'request')
  await expect(runtime.selectProfile(profile)).rejects.toMatchObject({ status: 401 })
  expect(request).not.toHaveBeenCalled()
})

test.each([
  [401, '登录已失效，请重新登录。'],
  [403, '当前账号无权访问此患者资料。'],
  [503, '云端服务暂时不可用，请稍后重试。']
])('distinguishes HTTP %s without parsing a non-JSON error body', async (status, message) => {
  h.apiBase = 'https://example.invalid'
  h.request.mockResolvedValue({ statusCode: status, data: '<html>gateway response</html>' })
  await expect(runtime.request('/care/context', 'PUT', {})).rejects.toMatchObject({ status, message, data: '<html>gateway response</html>' })
  expect(h.clear).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
})

test('a stale 401 response cannot clear a newer session', async () => {
  h.apiBase = 'https://example.invalid'
  let rejectResponse!: (value: { statusCode: number, data: unknown }) => void
  h.request.mockReturnValue(new Promise(resolve => { rejectResponse = resolve }))
  const pending = runtime.request('/care/context', 'PUT', {})
  h.account = 'second'
  h.token = 'newer-token'
  rejectResponse({ statusCode: 401, data: 'expired' })
  await expect(pending).rejects.toMatchObject({ status: 401, data: 'expired' })
  expect(h.clear).not.toHaveBeenCalled()
})

test('a selection conflict exposes its business code and a useful message', async () => {
  h.apiBase = 'https://example.invalid'
  h.request.mockResolvedValue({ statusCode: 409, data: { code: 'CARE_CONTEXT_CHANGED' } })
  await expect(runtime.request('/care/context', 'PUT', {})).rejects.toMatchObject({
    status: 409, code: 'CARE_CONTEXT_CHANGED', message: '档案选择已更新，请重新查看后再选择。'
  })
  expect(h.clear).not.toHaveBeenCalled()
})

test('settings use conditional selection and honor a canceled panel intent', async () => {
  let active = true
  const request = vi.spyOn(runtime, 'request').mockImplementation(async () => { active = false; return { selectionVersion: 1 } })
  await expect(runtime.selectProfile(profile, () => active)).resolves.toBe(false)
  expect(request.mock.calls).toEqual([['/care/context', 'GET']])
  expect(h.save).not.toHaveBeenCalled()
})

test('settings restore does not persist a server choice', async () => {
  const request = vi.spyOn(runtime, 'request')
  await expect(runtime.selectProfile(profile, () => true, { persist: false })).resolves.toBe(true)
  expect(request).not.toHaveBeenCalled()
  expect(h.save).toHaveBeenCalledWith(profile)
})

test('concurrent settings choices keep B when old A returns late', async () => {
  let release!: (value: any) => void, gets = 0
  const request = vi.spyOn(runtime, 'request').mockImplementation(async (_path, method) => {
    if (method === 'GET' && ++gets === 1) return new Promise(resolve => { release = resolve })
    return { selectionVersion: 2 }
  })
  const a = runtime.selectProfile({ ...profile, id: 'A' })
  await runtime.selectProfile({ ...profile, id: 'B' })
  release({ selectionVersion: 1 }); await a
  expect(h.save.mock.calls).toEqual([[{ ...profile, id: 'B' }]])
  expect(request.mock.calls.filter(c => c[1] === 'PUT')).toEqual([
    ['/care/context', 'PUT', { profileId: 'B', expectedSelectionVersion: 2 }]
  ])
})
