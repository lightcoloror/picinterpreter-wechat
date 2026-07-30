import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'

import {
  createDialectAudioRecognitionPort,
  type DialectAudioRecorderManager
} from './dialectAudioRecognitionPort'
import { taroCboardSessionStore } from './taroCboardAccountPort'

export const taroDialectAudioRecognitionPort =
  createDialectAudioRecognitionPort({
    apiBaseUrl: apiBaseUrlFor('dialectAsr'),
    getAuthToken: () => taroCboardSessionStore.getAuthToken(),
    getRecorderManager: () =>
      Taro.getRecorderManager() as unknown as DialectAudioRecorderManager,
    getFileSize: async filePath => {
      const result = await Taro.getFileInfo({ filePath })
      if (!('size' in result)) {
        throw new Error('Wechat did not return an audio size')
      }
      return Number(result.size)
    },
    uploadFile: async options => {
      const result = await Taro.uploadFile({
        url: options.url,
        filePath: options.filePath,
        name: options.name,
        header: options.header,
        timeout: options.timeout
      })
      return {
        statusCode: result.statusCode,
        data: result.data
      }
    },
    unlinkFile: filePath =>
      new Promise(resolve => {
        Taro.getFileSystemManager().unlink({
          filePath,
          success: () => resolve(),
          fail: () => resolve()
        })
      }),
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: timer => clearTimeout(timer),
    cancelCleanupDelayMs: 1500
  })
