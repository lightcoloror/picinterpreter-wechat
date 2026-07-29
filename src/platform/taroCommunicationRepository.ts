import Taro from '@tarojs/taro'
import type { CommunicationRepository } from '@cboard-communication-core/repository'

import { createWechatCommunicationRepository } from './communicationRepository'

export function createTaroCommunicationRepository(): CommunicationRepository {
  return createWechatCommunicationRepository({
    getStorageSync: key => Taro.getStorageSync(key),
    setStorageSync: (key, value) => Taro.setStorageSync(key, value),
    removeStorageSync: key => Taro.removeStorageSync(key)
  })
}
