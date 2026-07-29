import Taro from '@tarojs/taro'

import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { createPictureLibraryStore } from './pictureLibraryStore'
import { createRotatingPictureLibraryFileStorage } from './rotatingPictureLibraryFileStorage'

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

export const taroPictureLibraryStore = createPictureLibraryStore(
  storage,
  DEFAULT_BOARD_FIXTURES,
  fileStorage
)
