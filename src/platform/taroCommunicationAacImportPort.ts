import Taro from '@tarojs/taro'

import { taroCboardSessionStore } from './taroCboardAccountPort'
import { createCommunicationAacImportPort } from './communicationAacImportPort'

const fs = Taro.getFileSystemManager()

function writeFile(filePath: string, data: Uint8Array) {
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer
  return new Promise<void>((resolve, reject) => {
    fs.writeFile({
      filePath,
      data: arrayBuffer,
      success: () => resolve(),
      fail: reject
    })
  })
}

function removeFile(filePath: string) {
  return new Promise<void>(resolve => {
    fs.unlink({
      filePath,
      success: () => resolve(),
      fail: () => resolve()
    })
  })
}

export const taroCommunicationAacImportPort =
  createCommunicationAacImportPort({
    apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
    getAuthToken: () => taroCboardSessionStore.getAuthToken(),
    uploadFile: async options => {
      const extensionMatch = options.fileName
        .toLocaleLowerCase()
        .match(/\.[a-z0-9]+$/)
      const extension = extensionMatch ? extensionMatch[0] : '.aac'
      const filePath =
        `${Taro.env.USER_DATA_PATH}/aac-import-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}${extension}`
      await writeFile(filePath, options.data)
      try {
        const response = await Taro.uploadFile({
          url: options.url,
          filePath,
          name: 'file',
          header: options.header
        })
        return { statusCode: response.statusCode, data: response.data }
      } finally {
        await removeFile(filePath)
      }
    }
  })
