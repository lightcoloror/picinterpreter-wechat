import Taro from '@tarojs/taro'

import { createCommunicationNavigationIntentStore } from '../features/communication/communicationNavigationIntent'

export const taroCommunicationNavigationIntent =
  createCommunicationNavigationIntentStore({
    getStorageSync: key => Taro.getStorageSync(key),
    setStorageSync: (key, value) => Taro.setStorageSync(key, value),
    removeStorageSync: key => Taro.removeStorageSync(key)
  })
