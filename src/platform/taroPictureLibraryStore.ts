import Taro from '@tarojs/taro'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type { PictogramLibraryDTO } from '@cboard-communication-core/pictogramLibrary'

import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { createPictureLibraryStore } from './pictureLibraryStore'
import { createRotatingPictureLibraryFileStorage } from './rotatingPictureLibraryFileStorage'
import {
  canEditCareLibrary,
  careScopedKey,
  currentCareContext,
  isCareHydrating,
  markCareLocalChange
} from './taroCareContext'

const storage = {
  getStorageSync: (key: string) => Taro.getStorageSync(key),
  setStorageSync: (key: string, value: string) =>
    Taro.setStorageSync(key, value),
  removeStorageSync: (key: string) => Taro.removeStorageSync(key)
}

const userDataPath = String(Taro.env.USER_DATA_PATH || '').trim()
const fileStorage = userDataPath
  ? createRotatingPictureLibraryFileStorage({
      fileSystem: Taro.getFileSystemManager(),
      storage,
      rootPath: `${userDataPath}/picture-library`
    })
  : undefined

const guestStore = createPictureLibraryStore(
  storage,
  DEFAULT_BOARD_FIXTURES,
  fileStorage
)
function currentStore() {
  const context = currentCareContext()
  if (!context) return guestStore
  const scoped = {
    getStorageSync: (key: string) => Taro.getStorageSync(careScopedKey(key)),
    setStorageSync: (key: string, value: string) => Taro.setStorageSync(careScopedKey(key), value),
    removeStorageSync: (key: string) => Taro.removeStorageSync(careScopedKey(key))
  }
  const rootPath = `${userDataPath}/care-library-${bytesToHex(sha256(careScopedKey('library')))}`
  const files = userDataPath ? createRotatingPictureLibraryFileStorage({ fileSystem: Taro.getFileSystemManager(), storage: scoped, rootPath }) : undefined
  return createPictureLibraryStore(scoped, [], files)
}
export const taroPictureLibraryStore = {
  load() {
    if (currentCareContext() && Taro.getStorageSync(careScopedKey('care-locked'))) return []
    return currentStore().load()
  },
  save(value: BoardDTO[] | PictogramLibraryDTO) {
    if (!isCareHydrating() && !canEditCareLibrary()) {
      throw new Error('当前档案未授予图库编辑权限')
    }
    const saved = currentStore().save(value)
    markCareLocalChange('boards', saved)
    return saved
  },
  reset() { return currentStore().reset() }
}
