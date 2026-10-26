import Taro from '@tarojs/taro'
import { createReceiverLocalFileStorage } from './receiverLocalFileStorage'
import { careScopedKey } from './taroCareContext'

export function createTaroReceiverLocalFileStorage() {
  return createReceiverLocalFileStorage({
    rootPath: String(Taro.env?.USER_DATA_PATH || ''), files: Taro.getFileSystemManager(),
    legacy: { getStorageSync: key => Taro.getStorageSync(careScopedKey(key)) },
    getScopeKey: () => careScopedKey('receiver-local')
  })
}
