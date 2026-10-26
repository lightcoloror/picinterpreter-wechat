import Taro from '@tarojs/taro'
import { createFavoriteStateStore, FAVORITE_STATE_KEY } from '@cboard-communication-core/favoriteState'
import { createFavoriteLocalFileStorage } from './favoriteLocalFileStorage'
import { careScopedKey } from './taroCareContext'

export function createTaroFavoriteLocalFileStorage() {
  return createFavoriteLocalFileStorage({ rootPath: String(Taro.env?.USER_DATA_PATH || ''),
    files: Taro.getFileSystemManager(),
    legacy: { getStorageSync: key => Taro.getStorageSync(careScopedKey(key)) },
    getScopeKey: () => careScopedKey('favorite-local') })
}
export function createTaroFavoriteStateStore() {
  const files = createTaroFavoriteLocalFileStorage()
  return createFavoriteStateStore({ getScopeKey: () => careScopedKey(''),
    getItem: (key: string) => files.getStorageSync(key),
    setItem: (key: string, value: string) => files.setStorageSync(key, value) })
}
export { FAVORITE_STATE_KEY }
