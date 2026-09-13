import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { createCboardAccountPort } from './cboardAccountPort'
import { createCboardSessionStore } from './cboardSession'

export async function revokeCurrentCboardSession(token: string) {
  const base = apiBaseUrlFor('cloudFeatures')
  if (!base) return false
  try {
    const response = await Taro.request({ url: base.replace(/\/$/, '') + '/user/logout', method: 'POST',
      timeout: 10000, data: {}, header: { Authorization: `Bearer ${token}` } })
    return response.statusCode === 200 || response.statusCode === 401
  } catch (_) { return false }
}

export const taroCboardAccountPort = createCboardAccountPort({
  apiBaseUrl: apiBaseUrlFor('cloudFeatures'),
  request: async options => {
    const response = await Taro.request({
      url: options.url,
      method: options.method,
      data: options.data,
      header: options.header
    })
    return { statusCode: response.statusCode, data: response.data }
  }
})

const sessionStore = createCboardSessionStore({
  getStorageSync: key => Taro.getStorageSync(key),
  setStorageSync: (key, value) => Taro.setStorageSync(key, value),
  removeStorageSync: key => Taro.removeStorageSync(key)
})
export const taroCboardSessionStore = {
  ...sessionStore,
  save(value: Parameters<typeof sessionStore.save>[0]) {
    const previous = sessionStore.load()?.user.id
    const result = sessionStore.save(value)
    if (previous !== result?.user.id) Taro.eventCenter.trigger('care-identity-changed')
    return result
  },
  clear() { sessionStore.clear(); Taro.eventCenter.trigger('care-identity-changed') }
}
