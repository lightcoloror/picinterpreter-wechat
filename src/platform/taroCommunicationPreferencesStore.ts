import Taro from '@tarojs/taro'

import type { CommunicationPreferences } from '@cboard-communication-core/communicationPreferences'
import { createCommunicationPreferencesStore } from './communicationPreferencesStore'
import { careScopedKey, currentCareContext, markCareLocalChange } from './taroCareContext'

const deviceStore =
  createCommunicationPreferencesStore({
    getStorageSync: key => Taro.getStorageSync(careScopedKey(key)),
    setStorageSync: (key, value) => Taro.setStorageSync(careScopedKey(key), value)
  })
function load(): CommunicationPreferences {
  const device = deviceStore.load()
  if (!currentCareContext()?.profileId) return device
  const defaults = Taro.getStorageSync(careScopedKey('care-patient-defaults')) || {}
  const overrides = Taro.getStorageSync(careScopedKey('care-display-overrides')) || {}
  return { ...device,
    speechRate: Taro.getStorageSync(careScopedKey('care-pending-speechRate')) ? device.speechRate : defaults.speechRate ?? device.speechRate,
    fontSize: overrides.fontSize ? device.fontSize : defaults.fontSize ?? device.fontSize,
    gridColumns: overrides.gridColumns ? device.gridColumns : defaults.cardDensity ?? device.gridColumns }
}
function save(value: CommunicationPreferences) {
  const before = load()
  if (currentCareContext()?.profileId) {
    const overrides = Taro.getStorageSync(careScopedKey('care-display-overrides')) || {}
    if (value.fontSize !== before.fontSize) overrides.fontSize = true
    if (value.gridColumns !== before.gridColumns) overrides.gridColumns = true
    Taro.setStorageSync(careScopedKey('care-display-overrides'), overrides)
    if (value.speechRate !== before.speechRate) markCareLocalChange('speechRate', value.speechRate)
  }
  return deviceStore.save(value)
}
export const taroCommunicationPreferencesStore = { load, save, update(value: Partial<CommunicationPreferences>) { return save({ ...load(), ...value }) } }
