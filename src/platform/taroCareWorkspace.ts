import Taro from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { createCareSync } from '@cboard-communication-core/careSync'
import { projectCareBoards, queueCareBoards } from '@cboard-communication-core/careProjection'
import { encodeCareMedia, decodeCareMedia } from '@cboard-communication-core/careMediaValues'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { runtime } from './taroCareRuntime'
import { careScopedKey, currentCareContext, withCareHydration } from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'
import { createTaroCommunicationRepository } from './taroCommunicationRepository'
import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { configureCareCloudSync } from './communicationCloudSync'
import { taroPictogramOrderingStore } from './taroPictogramOrderingStore'

let active: { key: string; engine: ReturnType<typeof createCareSync> } | null = null
let pending: Promise<void> | null = null
let stopWatch: (() => void) | null = null
async function readImage(source: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(source)
  const bytes = match ? new Uint8Array(Taro.base64ToArrayBuffer(match[2]))
    : source.startsWith(String(Taro.env.USER_DATA_PATH || '/invalid-local-root/')) || source.startsWith('wxfile://')
      ? new Uint8Array(Taro.getFileSystemManager().readFileSync(source) as ArrayBuffer) : null
  if (!bytes) throw new Error('图片需先保存到本机，才能上传到患者图库')
  return { data: Taro.arrayBufferToBase64(bytes.buffer as ArrayBuffer), sha256: bytesToHex(sha256(bytes)),
    type: match ? match[1] : bytes[0] === 137 ? 'image/png' : bytes[0] === 255 ? 'image/jpeg' : 'image/webp' }
}
function project(engine: ReturnType<typeof createCareSync>) {
  const snapshot = engine.view()
  Taro.setStorageSync(careScopedKey('care-locked'), snapshot.locked)
  if (!snapshot.locked) {
    const image = (asset: any) => {
      const path = `${Taro.env.USER_DATA_PATH}/care-picture-${bytesToHex(sha256(careScopedKey(asset.mediaId)))}.${asset.type === 'image/jpeg' ? 'jpg' : asset.type.split('/')[1]}`
      Taro.getFileSystemManager().writeFileSync(path, Taro.base64ToArrayBuffer(asset.data))
      return path
    }
    const boards = projectCareBoards(snapshot, image)
    withCareHydration(() => {
      const defaults: Record<string, unknown> = {}
      for (const name of ['speechRate', 'fontSize', 'cardDensity']) {
        const resource = snapshot.resources[`preference:${name}`]
        if (resource && !resource.deleted) defaults[name] = resource.value.value
      }
      Taro.setStorageSync(careScopedKey('care-patient-defaults'), defaults)
      const ordering = taroPictogramOrderingStore.load()
      if (!Taro.getStorageSync(careScopedKey('care-pending-ordering'))) taroPictogramOrderingStore.save({ ...ordering, manualOrderByBoard: Object.fromEntries(boards.map(b => [b.id, b.layout.tileIds])) })
      if (!Taro.getStorageSync(careScopedKey('care-pending-boards'))) {
        if (boards.length) taroPictureLibraryStore.save(boards)
        else if (snapshot.cursor >= 0) taroPictureLibraryStore.reset()
      }
      const repository = createTaroCommunicationRepository()
      const kind = currentCareContext()?.selection?.relationship?.role === 'patient' ? 'favorite' : 'personalFavorite'
      const favorites = Object.values(snapshot.resources).filter((r: any) => !r.deleted && r.kind === kind)
      if (!Taro.getStorageSync(careScopedKey('care-pending-favorites'))) repository.overwriteCommunicationSavedPhrases(favorites.map((r: any) => ({ ...decodeCareMedia(r.value, snapshot.media, image), id: r.id, createdAt: r.value.createdAt || r.updatedAt || 1 })))
      const preferences = snapshot.resources['preference:personalImagePreferences']
      if (preferences && !preferences.deleted && !Taro.getStorageSync(careScopedKey('care-pending-personalImagePreferences'))) repository.overwritePersonalImagePreferences(decodeCareMedia(preferences.value.value, snapshot.media, image))
    })
  }
  Taro.eventCenter.trigger('care-content-changed')
}
export async function synchronizeCareWorkspace() {
  if (pending) return pending
  const context = currentCareContext()
  if (!context?.profileId) return
  const key = careScopedKey('workspace')
  const scoped = (suffix: string) => key.slice(0, -'workspace'.length) + suffix
  pending = (async () => {
    if (!active || active.key !== key) {
      const engine = createCareSync({ ...context, storage: runtime.storage, request: runtime.request, newId: runtime.newId,
        personalFavorites: true, currentAccount: () => currentCareContext()?.accountId, changed: () => undefined })
      active = { key, engine }
      await engine.init()
    }
    const engine = active.engine
    try {
      const raw = Taro.getStorageSync(scoped('care-pending-boards'))
      if (raw) {
        await queueCareBoards(engine, JSON.parse(String(raw)), readImage)
        if (Taro.getStorageSync(scoped('care-pending-boards')) === raw) Taro.removeStorageSync(scoped('care-pending-boards'))
      }
      const favoriteKey = scoped('care-pending-favorites')
      const favorites = Taro.getStorageSync(favoriteKey)
      if (favorites) {
        const kind = context.selection?.relationship?.role === 'patient' ? 'favorite' : 'personalFavorite'
        const items = JSON.parse(String(favorites))
        for (const item of items) {
          const old = engine.view().resources[`${kind}:${item.id}`]
          const value = await encodeCareMedia(item, engine, readImage)
          if (!old || JSON.stringify(old.value) !== JSON.stringify(value)) await engine.edit(kind, item.id, value)
        }
        const ids = new Set(items.map((item: any) => item.id))
        for (const r of Object.values(engine.view().resources) as any[]) if (r.kind === kind && !r.deleted && !ids.has(r.id)) await engine.edit(kind, r.id, null, 'delete')
        if (Taro.getStorageSync(favoriteKey) === favorites) Taro.removeStorageSync(favoriteKey)
      }
      const prefKey = scoped('care-pending-personalImagePreferences')
      const prefs = Taro.getStorageSync(prefKey)
      if (prefs) {
        const value = { value: await encodeCareMedia(JSON.parse(String(prefs)), engine, readImage) }
        if (JSON.stringify(engine.view().resources['preference:personalImagePreferences']?.value) !== JSON.stringify(value)) await engine.edit('preference', 'personalImagePreferences', value)
        if (Taro.getStorageSync(prefKey) === prefs) Taro.removeStorageSync(prefKey)
      }
      const orderKey = scoped('care-pending-ordering')
      const order = Taro.getStorageSync(orderKey)
      if (order) {
        for (const [id, tileIds] of Object.entries(JSON.parse(String(order)))) {
          const board = engine.view().resources[`board:${id}`]
          if (board && !board.deleted && JSON.stringify(board.value.tileIds) !== JSON.stringify(tileIds)) await engine.edit('board', id, { ...board.value, tileIds })
        }
        if (Taro.getStorageSync(orderKey) === order) Taro.removeStorageSync(orderKey)
      }
      const rateKey = scoped('care-pending-speechRate')
      const rate = Taro.getStorageSync(rateKey)
      if (rate) {
        const value = { value: JSON.parse(String(rate)) }
        if (JSON.stringify(engine.view().resources['preference:speechRate']?.value) !== JSON.stringify(value)) await engine.edit('preference', 'speechRate', value)
        if (Taro.getStorageSync(rateKey) === rate) Taro.removeStorageSync(rateKey)
      }
      await engine.sync()
    } finally { if (currentCareContext()?.accountId === context.accountId && careScopedKey('workspace') === key) project(engine) }
  })().finally(() => { pending = null })
  return pending
}
export function startCareWorkspace() {
  if (stopWatch || !runtime.enabled) return
  configureCareCloudSync({ active: () => Boolean(currentCareContext()?.profileId), sync: synchronizeCareWorkspace })
  const base = apiBaseUrlFor('cloudFeatures')?.replace(/\/$/, '')
  Taro.addInterceptor(chain => {
    const context = currentCareContext()
    const fundingId = context?.profileId && runtime.funding(context.profileId)
    const params = chain.requestParams
    if (base && fundingId && context && params.url.startsWith(base + '/')) {
      params.header = { ...params.header, 'X-Care-Profile-Id': context.profileId, 'X-Care-Funding-Id': fundingId,
        'Idempotency-Key': params.header?.['Idempotency-Key'] || `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
    }
    return chain.proceed(params)
  })
  const update = () => { void synchronizeCareWorkspace().catch(() => undefined) }
  const stop = runtime.watch(update)
  Taro.eventCenter.on('care-local-change', update)
  const identityChanged = () => { active = null; void Taro.reLaunch({ url: '/pages/index/index' }) }
  Taro.eventCenter.on('care-identity-changed', identityChanged)
  stopWatch = () => { stop(); Taro.eventCenter.off('care-local-change', update); Taro.eventCenter.off('care-identity-changed', identityChanged) }
}
export function useCareRefresh(callback: () => void) {
  const ref = useRef(callback); ref.current = callback
  useEffect(() => {
    const changed = () => ref.current()
    startCareWorkspace()
    Taro.eventCenter.on('care-content-changed', changed)
    return () => { Taro.eventCenter.off('care-content-changed', changed) }
  }, [])
}
