import Taro from '@tarojs/taro'

import { createCommunicationAiPort } from './communicationAiPort'
import { taroCboardSessionStore } from './taroCboardAccountPort'

export const taroCommunicationAiPort = createCommunicationAiPort({
  apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
  getAuthToken: () => taroCboardSessionStore.getAuthToken(),
  request: async options => {
    const response = await Taro.request({
      url: options.url,
      method: options.method,
      data: options.data,
      header: options.header
    })

    return {
      statusCode: response.statusCode,
      data: response.data
    }
  }
})
