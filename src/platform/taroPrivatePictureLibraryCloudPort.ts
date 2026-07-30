import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { taroCboardSessionStore } from './taroCboardAccountPort'
import {
  createPrivateDeviceDataCloudPort,
  createPrivatePictureLibraryCloudPort
} from './privatePictureLibraryCloudPort'

const fs = Taro.getFileSystemManager()

function toArrayBuffer(data: Uint8Array) {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer
}

function writeFile(filePath: string, data: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile({
      filePath,
      data: toArrayBuffer(data),
      success: () => resolve(),
      fail: reject
    })
  })
}

function readFile(filePath: string) {
  return new Promise<Uint8Array>((resolve, reject) => {
    fs.readFile({
      filePath,
      success: result => {
        if (typeof result.data === 'string') {
          reject(new TypeError('Expected binary private library data'))
          return
        }
        resolve(
          result.data instanceof Uint8Array
            ? result.data
            : new Uint8Array(result.data)
        )
      },
      fail: reject
    })
  })
}

function removeFile(filePath: string) {
  return new Promise<void>(resolve => {
    if (!filePath) {
      resolve()
      return
    }
    fs.unlink({
      filePath,
      success: () => resolve(),
      fail: () => resolve()
    })
  })
}

function createTaroPrivateArchiveDependencies(tempFilePrefix: string) {
  return {
    apiBaseUrl: apiBaseUrlFor('cloudFeatures'),
    getAuthToken: () => taroCboardSessionStore.getAuthToken(),
    request: async options => {
      const response = await Taro.request({
        url: options.url,
        method: options.method,
        header: options.header
      })
      return { statusCode: response.statusCode, data: response.data }
    },
    uploadArchive: async options => {
      const suffix = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
      const extension = options.fileName.includes('.')
        ? options.fileName.slice(options.fileName.lastIndexOf('.'))
        : '.bin'
      const filePath =
        `${Taro.env.USER_DATA_PATH}/${tempFilePrefix}-${suffix}${extension}`
      await writeFile(filePath, options.data)
      try {
        const response = await Taro.uploadFile({
          url: options.url,
          filePath,
          name: options.fieldName,
          header: options.header
        })
        return { statusCode: response.statusCode, data: response.data }
      } finally {
        await removeFile(filePath)
      }
    },
    downloadArchive: async options => {
      let filePath = ''
      try {
        const response = await Taro.downloadFile({
          url: options.url,
          header: options.header
        })
        filePath = response.tempFilePath || ''
        return response.statusCode >= 200 && response.statusCode < 300
          ? { statusCode: response.statusCode, data: await readFile(filePath) }
          : { statusCode: response.statusCode }
      } finally {
        await removeFile(filePath)
      }
    }
  }
}

export const taroPrivatePictureLibraryCloudPort =
  createPrivatePictureLibraryCloudPort(
    createTaroPrivateArchiveDependencies('private-library')
  )

export const taroPrivateDeviceDataCloudPort =
  createPrivateDeviceDataCloudPort(
    createTaroPrivateArchiveDependencies('private-device-data')
  )
