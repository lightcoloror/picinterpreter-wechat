import { createTaroFavoriteLocalFileStorage, FAVORITE_STATE_KEY } from './taroFavoriteLocalFileStorage'
import Taro from '@tarojs/taro'
import { COMMUNICATION_STORAGE_KEYS, type CommunicationRepository } from '@cboard-communication-core/repository'
import { sameCareFavoriteList } from '@cboard-communication-core/careFavoriteChanges'

import { createWechatCommunicationRepository } from './communicationRepository'
import { canEditCarePreferences, careScopedKey, currentCareContext, isCareHydrating, markCareLocalChange, withCareHydration } from './taroCareContext'
import { createTaroExpressionLocalFileStorage } from './taroExpressionLocalFileStorage'
import { createTaroReceiverLocalFileStorage } from './taroReceiverLocalFileStorage'

// Keep the original storage scope readable after an async download and a profile
// change. Raw references are deliberate: a stale candidate can still own a file.
export function captureMissingTokenImageUsage() {
  const originalKey = careScopedKey(COMMUNICATION_STORAGE_KEYS.missingTokens)
  return (image: string) => {
    const keys = new Set([
      originalKey,
      careScopedKey(COMMUNICATION_STORAGE_KEYS.missingTokens)
    ])
    return [...keys].some(key => {
      const stored = Taro.getStorageSync(key)
      if (stored === '' || stored === undefined || stored === null) return false
      const records = JSON.parse(String(stored))
      if (!Array.isArray(records)) throw new Error('Missing token references unavailable')
      return records.some(record => record && [
        record.resolvedPictogram,
        record.suggestedPictogram,
        ...(Array.isArray(record.suggestedPictograms) ? record.suggestedPictograms : [])
      ].some(pictogram => pictogram && pictogram.image === image))
    })
  }
}

export function createTaroCommunicationRepository(): CommunicationRepository {
  const expressionFiles = createTaroExpressionLocalFileStorage()
  const receiverFiles = createTaroReceiverLocalFileStorage()
  const favoriteFiles = createTaroFavoriteLocalFileStorage()
  // Repository schema initialization is local, not a user-requested cloud edit.
  const repository = withCareHydration(() => createWechatCommunicationRepository({
    getScopeKey: () => careScopedKey(''),
    prepareFavoriteCommit: (before, after) => {
      if (isCareHydrating() || !currentCareContext()?.profileId || sameCareFavoriteList(before.phrases, after.phrases)) return after.pending
      return { items: after.phrases, base: before.pending ? before.pending.base : before.phrases, revision: after.revision }
    },
    getStorageSync: key => {
      const context = currentCareContext()
      if (context?.profileId && key === 'cboard_communication_patient_id') return context.profileId
      if (context?.familyId && key === 'cboard_communication_workspace_id') return context.familyId
      if (favoriteFiles.handles(key)) return favoriteFiles.getStorageSync(key)
      if (expressionFiles.handles(key)) return expressionFiles.getStorageSync(key)
      if (receiverFiles.handles(key)) return receiverFiles.getStorageSync(key)
      return Taro.getStorageSync(careScopedKey(key))
    },
    setStorageSync: (key, value) => {
      if (favoriteFiles.handles(key)) {
        const previous = key === FAVORITE_STATE_KEY ? favoriteFiles.getStorageSync(key) : null
        favoriteFiles.setStorageSync(key, value)
        if (key === FAVORITE_STATE_KEY && !isCareHydrating()) {
          const before = previous ? JSON.parse(String(previous)).pending : null
          const after = JSON.parse(value).pending
          if (after && JSON.stringify(before) !== JSON.stringify(after)) Taro.eventCenter.trigger('care-local-change')
        }
        return
      }
      if (receiverFiles.handles(key)) { receiverFiles.setStorageSync(key, value); return }
      if (expressionFiles.handles(key)) {
        expressionFiles.setStorageSync(key, value)
        return
      }
      if (
        key === 'cboard_communication_personal_image_preferences' &&
        !isCareHydrating() &&
        !canEditCarePreferences()
      ) {
        throw new Error('当前档案未授予熟悉图片偏好编辑权限')
      }
      Taro.setStorageSync(careScopedKey(key), value)
      if (key === 'cboard_communication_personal_image_preferences') markCareLocalChange('personalImagePreferences', JSON.parse(String(value)))
    },
    removeStorageSync: key => favoriteFiles.handles(key) ? favoriteFiles.removeStorageSync(key) : receiverFiles.handles(key) ? receiverFiles.removeStorageSync(key) : expressionFiles.handles(key)
      ? expressionFiles.removeStorageSync(key) : Taro.removeStorageSync(careScopedKey(key))
  }))
  return { ...repository, loadCommunicationIdentity() {
    const context = currentCareContext()
    return context?.profileId ? { patientId: context.profileId, workspaceId: context.familyId } : repository.loadCommunicationIdentity()
  } }
}
