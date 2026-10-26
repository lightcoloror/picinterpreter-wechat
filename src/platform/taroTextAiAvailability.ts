import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { evaluateCareTextAiAvailability } from '@cboard-communication-core/careAiAvailability'
import { runtimeCapabilities } from '../config/runtimeCapabilities'
import { taroCboardSessionStore } from './taroCboardAccountPort'
import { careScopedKey, currentCareContext } from './taroCareContext'

export function getTaroTextAiAvailability() {
  const enabled = runtimeCapabilities.textAiFeatures
  try {
    const session = taroCboardSessionStore.load()
    const careMode = process.env.TARO_APP_CARE_COLLABORATION === 'true'
    const context = currentCareContext()
    const fundingId = context?.profileId && Taro.getStorageSync(`care-funding-v1:${context.accountId}:${context.profileId}`)
    const profile = context?.selection
    const availability = evaluateCareTextAiAvailability({
      enabled, isLogged: Boolean(session?.token), accountId: session?.user.id, careMode,
      profile: profile && { ...profile, locked: profile.locked || Boolean(Taro.getStorageSync(careScopedKey('care-locked'))) },
      fundingId: String(fundingId || '')
    })
    // Local signature only. Never render, persist or send tokens as evidence.
    return { ...availability, contextKey: JSON.stringify([session?.token, context?.accountId,
      context?.familyId, context?.profileId, fundingId, availability.code]) }
  } catch (_) {
    return { ...evaluateCareTextAiAvailability({ enabled, isLogged: true, careMode: true,
      accountId: 'unavailable', storageFailed: true }), contextKey: 'storage-unavailable' }
  }
}

export function useTaroTextAiAvailability() {
  const [state, setState] = useState(getTaroTextAiAvailability)
  const refresh = () => setState(getTaroTextAiAvailability())
  useDidShow(refresh)
  useEffect(() => {
    const events = ['care-ai-context-changed', 'care-identity-changed', 'care-content-changed']
    events.forEach(event => Taro.eventCenter.on(event, refresh))
    return () => events.forEach(event => Taro.eventCenter.off(event, refresh))
  }, [])
  return state
}

export function openTextAiSetup(action?: string) {
  if (!action) return
  return Taro.navigateTo({ url: action === 'login'
    ? '/packages/management/pages/index/index' : '/packages/management/pages/care/index' })
}
