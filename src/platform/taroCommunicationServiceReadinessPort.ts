import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { createCommunicationServiceReadinessPort } from './communicationServiceReadinessPort'

export const taroCommunicationServiceReadinessPort =
  createCommunicationServiceReadinessPort({
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
