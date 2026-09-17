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
