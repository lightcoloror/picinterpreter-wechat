import Taro from '@tarojs/taro'

import { createPublicBoardLibraryPort } from './publicBoardLibraryPort'

export const taroPublicBoardLibraryPort = createPublicBoardLibraryPort({
  apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
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
