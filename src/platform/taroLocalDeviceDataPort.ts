import Taro from '@tarojs/taro'

import {
  createLocalDeviceDataPort,
  isGeneratedLocalDataFileName
} from './localDeviceDataPort'

const fs = Taro.getFileSystemManager()

function getUserDataPath() {
  const path = String(Taro.env.USER_DATA_PATH || '').trim()
  if (!path) {
    throw new TypeError('Wechat user data path is unavailable')
  }
  return path
}

function isMissingFileError(error: unknown) {
  const message = String(
    error && typeof error === 'object' && 'errMsg' in error
      ? (error as { errMsg?: unknown }).errMsg
      : error || ''
  ).toLocaleLowerCase()
  return message.includes('no such file') || message.includes('not exist')
}

function unlinkFile(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    fs.unlink({
      filePath,
      success: () => resolve(),
      fail: reject
    })
  })
}

async function removeFile(filePath: string) {
  try {
    await Taro.removeSavedFile({ filePath })
    return
  } catch (error) {
    try {
      await unlinkFile(filePath)
    } catch (unlinkError) {
      if (!isMissingFileError(unlinkError)) throw unlinkError
    }
  }
}

function listGeneratedFiles() {
  const userDataPath = getUserDataPath()
  return new Promise<string[]>((resolve, reject) => {
    fs.readdir({
      dirPath: userDataPath,
      success: result =>
        resolve(
          result.files
            .filter(isGeneratedLocalDataFileName)
            .map(name => userDataPath + '/' + name)
        ),
      fail: error => {
        if (isMissingFileError(error)) {
          resolve([])
          return
        }
        reject(error)
      }
    })
  })
}

function removePictureLibraryRoot() {
  const userDataPath = getUserDataPath()
  return new Promise<void>((resolve, reject) => {
    fs.rmdir({
      dirPath: userDataPath + '/picture-library',
      recursive: true,
      success: () => resolve(),
      fail: error => {
        if (isMissingFileError(error)) {
          resolve()
          return
        }
        reject(error)
      }
    })
  })
}

export const taroLocalDeviceDataPort = createLocalDeviceDataPort({
  removeFile,
  listSavedFiles: async () => {
    const result = await Taro.getSavedFileList()
    return result.fileList.map(item => item.filePath)
  },
  listGeneratedFiles,
  removePictureLibraryRoot,
  clearStorage: async () => {
    await Taro.clearStorage()
  }
})
