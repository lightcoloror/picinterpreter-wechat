import Taro from '@tarojs/taro'

import { createCareDevicePreferencesStore } from '@cboard-communication-core/careDevicePreferences'
import { careScopedKey, currentCareContext } from './taroCareContext'

export const taroCommunicationPreferencesStore = createCareDevicePreferencesStore({
  storage: {
    getItem: key => {
      const value = Taro.getStorageSync(careScopedKey(key))
      return value === undefined || value === null || typeof value === 'string' ? value : JSON.stringify(value)
    },
    setItem: (key, value) => Taro.setStorageSync(careScopedKey(key), value)
  },
  scoped: () => Boolean(currentCareContext()?.profileId),
  scope: () => careScopedKey(''),
  defaults: () => Taro.getStorageSync(careScopedKey('care-patient-defaults')) || {},
  // Do not migrate or clear a request that was explicitly queued by an older
  // build. New easy-settings changes are device overrides, not shared writes.
  legacySpeechPending: () => Boolean(Taro.getStorageSync(careScopedKey('care-pending-speechRate')))
})
