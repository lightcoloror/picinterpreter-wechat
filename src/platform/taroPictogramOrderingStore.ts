import Taro from '@tarojs/taro'
import { createWechatKeyValueStore } from '@cboard-communication-core/adapters/wechatStorage'
import { createPictogramOrderingStore } from '@cboard-communication-core/pictogramOrderingStore'
import { careScopedKey, markCareLocalChange } from './taroCareContext'

export const taroPictogramOrderingStore = createPictogramOrderingStore(
  createWechatKeyValueStore({
    getStorageSync: key => Taro.getStorageSync(careScopedKey(key)),
    setStorageSync: (key, value) => {
      const previous = Taro.getStorageSync(careScopedKey(key))
      const old = previous ? JSON.parse(String(previous)) : {}
      const next = JSON.parse(String(value))
      Taro.setStorageSync(careScopedKey(key), value)
      if (JSON.stringify(old.manualOrderByBoard || {}) !== JSON.stringify(next.manualOrderByBoard || {})) markCareLocalChange('ordering', next.manualOrderByBoard)
    },
    removeStorageSync: key => Taro.removeStorageSync(careScopedKey(key))
  })
)
