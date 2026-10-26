import Taro from '@tarojs/taro'
import { createExpressionLocalFileStorage } from './expressionLocalFileStorage'
import { careScopedKey } from './taroCareContext'

export function createTaroExpressionLocalFileStorage() {
  return createExpressionLocalFileStorage({
    rootPath: String(Taro.env?.USER_DATA_PATH || ''),
    files: Taro.getFileSystemManager(),
    legacy: { getStorageSync: key => Taro.getStorageSync(careScopedKey(key)) },
    getScopeKey: () => careScopedKey('expression-local')
  })
}
