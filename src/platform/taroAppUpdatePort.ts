import Taro from '@tarojs/taro'

import {
  createAppUpdatePort,
  type AppUpdateManager
} from './appUpdatePort'

const unavailableManager: AppUpdateManager = {
  applyUpdate() {},
  onCheckForUpdate(callback) {
    callback({ hasUpdate: false })
  },
  onUpdateReady() {},
  onUpdateFailed() {}
}

function getTaroUpdateManager(): AppUpdateManager {
  try {
    return typeof Taro.getUpdateManager === 'function'
      ? Taro.getUpdateManager()
      : unavailableManager
  } catch (error) {
    return unavailableManager
  }
}

export const taroAppUpdatePort = createAppUpdatePort(
  getTaroUpdateManager()
)
