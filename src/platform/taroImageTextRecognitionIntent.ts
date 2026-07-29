import Taro from '@tarojs/taro'

import {
  createImageTextRecognitionIntentStore
} from '../features/communication/imageTextRecognitionIntent'

export const taroImageTextRecognitionIntent =
  createImageTextRecognitionIntentStore({
    getStorageSync: key => Taro.getStorageSync(key),
    setStorageSync: (key, value) => Taro.setStorageSync(key, value),
    removeStorageSync: key => Taro.removeStorageSync(key)
  })
