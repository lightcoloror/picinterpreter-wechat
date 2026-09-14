import { afterEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ account: 'first', save: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: {} }))
vi.mock('./taroCboardAccountPort', () => ({ taroCboardSessionStore: { load: () => h.account ? { user: { id: h.account }, token: 'synthetic' } : null } }))
vi.mock('./taroCareContext', () => ({ saveCareSelection: h.save }))
vi.mock('./taroSpeechPort', () => ({ wechatSpeechPort: {} }))
vi.mock('../config/runtimeCapabilities', () => ({ apiBaseUrlFor: () => '' }))
import { runtime } from './taroCareRuntime'
const profile = { id: 'patient', familyId: 'family' }
afterEach(() => { vi.restoreAllMocks(); h.save.mockClear(); h.account = 'first' })
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
test('logged out settings cannot send a selection request', async () => {
  h.account = ''
  const request = vi.spyOn(runtime, 'request')
  await expect(runtime.selectProfile(profile)).rejects.toMatchObject({ status: 401 })
  expect(request).not.toHaveBeenCalled()
})
