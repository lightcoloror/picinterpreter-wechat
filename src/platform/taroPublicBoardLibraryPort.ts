import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { createPublicBoardLibraryPort } from './publicBoardLibraryPort'

export const taroPublicBoardLibraryPort = createPublicBoardLibraryPort({
  apiBaseUrl: apiBaseUrlFor('cloudFeatures'),
  request: async options => {
    const response = await Taro.request({
      url: options.url,
      method: options.method,
      header: options.header
    })
    return {
      statusCode: response.statusCode,
      data: response.data
    }
  }
})
