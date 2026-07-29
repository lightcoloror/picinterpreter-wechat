import Taro from '@tarojs/taro'

import { createNetworkStatusPort } from './networkStatusPort'

export const taroNetworkStatusPort = createNetworkStatusPort({
  getNetworkType: () => Taro.getNetworkType(),
  onNetworkStatusChange: listener => Taro.onNetworkStatusChange(listener),
  offNetworkStatusChange: listener => Taro.offNetworkStatusChange(listener)
})
