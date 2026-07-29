import Taro from '@tarojs/taro'

import { createCboardAccountPort } from './cboardAccountPort'
import { createCboardSessionStore } from './cboardSession'

export const taroCboardAccountPort = createCboardAccountPort({
  apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
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
