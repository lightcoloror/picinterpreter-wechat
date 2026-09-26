import Taro from '@tarojs/taro'
import type { CommunicationRepository } from '@cboard-communication-core/repository'
import { sameCareFavoriteList } from '@cboard-communication-core/careFavoriteChanges'

import { createWechatCommunicationRepository } from './communicationRepository'
import { canEditCarePreferences, careScopedKey, currentCareContext, isCareHydrating, markCareLocalChange, withCareHydration } from './taroCareContext'

export function createTaroCommunicationRepository(): CommunicationRepository {
  // Repository schema initialization is local, not a user-requested cloud edit.
  const repository = withCareHydration(() => createWechatCommunicationRepository({
    getStorageSync: key => {
      const context = currentCareContext()
      if (context?.profileId && key === 'cboard_communication_patient_id') return context.profileId
      if (context?.familyId && key === 'cboard_communication_workspace_id') return context.familyId
      return Taro.getStorageSync(careScopedKey(key))
    },
    setStorageSync: (key, value) => {
      if (
        key === 'cboard_communication_personal_image_preferences' &&
        !isCareHydrating() &&
        !canEditCarePreferences()
      ) {
        throw new Error('当前档案未授予熟悉图片偏好编辑权限')
      }
      const previous = key === 'cboard_communication_saved_phrases'
        ? Taro.getStorageSync(careScopedKey(key)) : null
      Taro.setStorageSync(careScopedKey(key), value)
      if (key === 'cboard_communication_saved_phrases') {
        const items = JSON.parse(String(value))
        const base = previous ? JSON.parse(String(previous)) : []
        if (!sameCareFavoriteList(base, items)) {
          const pending = Taro.getStorageSync(careScopedKey('care-pending-favorites'))
          const packet = pending ? JSON.parse(String(pending)) : null
          // Preserve the original baseline through rapid saves and restarts.
          // Legacy pending arrays have no reliable baseline; retain compatibility.
          markCareLocalChange('favorites', {
            items, base: packet ? packet.base : base
          })
        }
      }
      if (key === 'cboard_communication_personal_image_preferences') markCareLocalChange('personalImagePreferences', JSON.parse(String(value)))
    },
    removeStorageSync: key => Taro.removeStorageSync(careScopedKey(key))
  }))
  return { ...repository, loadCommunicationIdentity() {
    const context = currentCareContext()
    return context?.profileId ? { patientId: context.profileId, workspaceId: context.familyId } : repository.loadCommunicationIdentity()
  } }
}
