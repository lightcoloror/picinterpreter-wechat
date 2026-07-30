import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../../config/runtimeCapabilities'

import { taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import { saveBase64PngToUserData } from '../../platform/taroBase64ImageFile'
import { createBackgroundRemovalPort } from './backgroundRemovalPort'

export const taroBackgroundRemovalPort =
  createBackgroundRemovalPort({
    apiBaseUrl: apiBaseUrlFor('aiFeatures'),
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
    },
    saveBase64Png: imageBase64 =>
      saveBase64PngToUserData(
        imageBase64,
        'picinterpreter-background'
      )
  })
