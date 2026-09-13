import Taro from '@tarojs/taro'
import type { CommunicationRepository } from '@cboard-communication-core/repository'

import { createWechatCommunicationRepository } from './communicationRepository'
import { careScopedKey, currentCareContext, markCareLocalChange } from './taroCareContext'

export function createTaroCommunicationRepository(): CommunicationRepository {
  const repository = createWechatCommunicationRepository({
    getStorageSync: key => {
      const context = currentCareContext()
      if (context?.profileId && key === 'cboard_communication_patient_id') return context.profileId
      if (context?.familyId && key === 'cboard_communication_workspace_id') return context.familyId
      return Taro.getStorageSync(careScopedKey(key))
    },
    setStorageSync: (key, value) => {
      Taro.setStorageSync(careScopedKey(key), value)
      if (key === 'cboard_communication_saved_phrases') markCareLocalChange('favorites', JSON.parse(String(value)))
      if (key === 'cboard_communication_personal_image_preferences') markCareLocalChange('personalImagePreferences', JSON.parse(String(value)))
    },
    removeStorageSync: key => Taro.removeStorageSync(careScopedKey(key))
  })
  return { ...repository, loadCommunicationIdentity() {
    const context = currentCareContext()
    return context?.profileId ? { patientId: context.profileId, workspaceId: context.familyId } : repository.loadCommunicationIdentity()
  } }
}
