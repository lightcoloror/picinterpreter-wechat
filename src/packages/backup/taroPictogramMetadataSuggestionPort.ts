import Taro from '@tarojs/taro'

import { taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import { createPictogramMetadataSuggestionPort } from './pictogramMetadataSuggestionPort'

export const taroPictogramMetadataSuggestionPort =
  createPictogramMetadataSuggestionPort({
    apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
    getAuthToken: () => taroCboardSessionStore.getAuthToken(),
    compressImage: async filePath => {
      const result = await Taro.compressImage({
        src: filePath,
        quality: 70
      })
      return { tempFilePath: result.tempFilePath }
    },
    getFileSize: async filePath => {
      const result = await Taro.getFileInfo({ filePath })
      if (!('size' in result)) {
        throw new Error('Wechat did not return an image size')
      }
      return Number(result.size)
    },
    uploadFile: async options => {
      const result = await Taro.uploadFile({
        url: options.url,
        filePath: options.filePath,
        name: options.name,
        header: options.header
      })
      return {
        statusCode: result.statusCode,
        data: result.data
      }
    }
  })
