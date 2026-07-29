import Taro from '@tarojs/taro'

import { createCommunicationPreferencesStore } from './communicationPreferencesStore'

export const taroCommunicationPreferencesStore =
  createCommunicationPreferencesStore({
    getStorageSync: key => Taro.getStorageSync(key),
    setStorageSync: (key, value) => Taro.setStorageSync(key, value)
  })
