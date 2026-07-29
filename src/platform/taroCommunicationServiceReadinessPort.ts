import Taro from '@tarojs/taro'

import { createCommunicationServiceReadinessPort } from './communicationServiceReadinessPort'

export const taroCommunicationServiceReadinessPort =
  createCommunicationServiceReadinessPort({
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
