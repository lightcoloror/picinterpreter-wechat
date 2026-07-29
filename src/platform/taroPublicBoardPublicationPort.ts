import Taro from '@tarojs/taro'

import { taroCboardSessionStore } from './taroCboardAccountPort'
import { createPublicBoardPublicationPort } from './publicBoardPublicationPort'

async function resolveUploadPath(source: string) {
  if (!/^https:\/\//i.test(source)) return source

  const result = await Taro.downloadFile({
    url: source,
    timeout: 30_000
  })
  if (
    result.statusCode < 200 ||
    result.statusCode >= 300 ||
    !result.tempFilePath
  ) {
    throw new Error('公开素材下载失败，尚未发布任何沟通板。')
  }
  return result.tempFilePath
}

export const taroPublicBoardPublicationPort =
  createPublicBoardPublicationPort({
    apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
    getIdentity: () => {
      const session = taroCboardSessionStore.load()
      const token = taroCboardSessionStore.getAuthToken()
      const email = session && session.user.email
      return token && email ? { token, email } : null
    },
    request: async options => {
      const response = await Taro.request({
        url: options.url,
        method: options.method,
        data: options.data,
        header: options.header,
        timeout: 30_000
      })
      return {
        statusCode: response.statusCode,
        data: response.data
      }
    },
    uploadFile: async options => {
      const filePath = await resolveUploadPath(options.filePath)
      const response = await Taro.uploadFile({
        url: options.url,
        filePath,
        name: options.name,
        header: options.header,
        timeout: 60_000
      })
      return {
        statusCode: response.statusCode,
        data: response.data
      }
    }
  })

