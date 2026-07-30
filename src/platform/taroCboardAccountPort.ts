import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { createCboardAccountPort } from './cboardAccountPort'
import { createCboardSessionStore } from './cboardSession'

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

export const taroCboardSessionStore = createCboardSessionStore({
  getStorageSync: key => Taro.getStorageSync(key),
  setStorageSync: (key, value) => Taro.setStorageSync(key, value),
  removeStorageSync: key => Taro.removeStorageSync(key)
})
