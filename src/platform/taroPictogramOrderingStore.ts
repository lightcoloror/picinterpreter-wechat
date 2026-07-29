import Taro from '@tarojs/taro'
import { createWechatKeyValueStore } from '@cboard-communication-core/adapters/wechatStorage'
import { createPictogramOrderingStore } from '@cboard-communication-core/pictogramOrderingStore'

export const taroPictogramOrderingStore = createPictogramOrderingStore(
  createWechatKeyValueStore({
    getStorageSync: key => Taro.getStorageSync(key),
    setStorageSync: (key, value) => Taro.setStorageSync(key, value),
    removeStorageSync: key => Taro.removeStorageSync(key)
  })
)
