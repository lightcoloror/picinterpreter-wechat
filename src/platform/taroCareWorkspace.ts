import { createTaroFavoriteStateStore } from './taroFavoriteLocalFileStorage'
import { assertCommunicationRepositorySchemaReadable } from '@cboard-communication-core/repository'
import { createWechatKeyValueStore } from '@cboard-communication-core/adapters/wechatStorage'
import Taro from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { createCareSync } from '@cboard-communication-core/careSync'
import { projectCareBoards, queueCareBoards } from '@cboard-communication-core/careProjection'
import { encodeCareMedia, decodeCareMedia } from '@cboard-communication-core/careMediaValues'
import { sameCareFavoriteContent } from '@cboard-communication-core/careFavoriteChanges'
import { assertSavedPhraseCapacity } from '@cboard-communication-core/savedPhraseManagement'
import { projectCareSharedPhrases } from '@cboard-communication-core/careSharedPhrases'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { careErrorMessage } from '@cboard-communication-core/careErrors'
import { runtime } from './taroCareRuntime'
import { careScopedKey, currentCareContext, saveCareSelection, withCareHydration } from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'
import { preserveCareLocalTileMedia } from './careLocalMediaProjection'
import { preserveCareLocalFavoriteMedia } from '@cboard-communication-core/careLocalMediaProjection'
import { createTaroCommunicationRepository } from './taroCommunicationRepository'
import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { configureCareCloudSync } from './communicationCloudSync'
import { taroPictogramOrderingStore } from './taroPictogramOrderingStore'
import { careBuiltinImages } from './taroCareBuiltinImages'
import { assertCareAiRequestScope } from './taroCommunicationAiPort'

let active: { key: string; engine: ReturnType<typeof createCareSync> } | null = null
let pending: Promise<void> | null = null
let stopWatch: (() => void) | null = null
function assertCurrentSchemaReadable() {
  assertCommunicationRepositorySchemaReadable(createWechatKeyValueStore({
    getStorageSync: key => Taro.getStorageSync(careScopedKey(key)),
    setStorageSync: () => { throw new Error('Schema preflight is read-only') }
  }))
}
export function hasCareFavoriteProjection(
  snapshot: { cursor?: number; resources: Record<string, { kind?: string }> },
  kind: string
) {
  // A fresh engine has cursor -1 and no authoritative favorite snapshot.
  // Explicit local records (including deletions) or a received server cursor
  // establish a projection; an unrelated board alone does not.
  return (typeof snapshot.cursor === 'number' && snapshot.cursor >= 0) ||
    Object.values(snapshot.resources).some(resource => resource.kind === kind)
}
export function loadCareSharedPhrases() {
  if (!currentCareContext()?.profileId || Taro.getStorageSync(careScopedKey('care-locked'))) return []
  return Taro.getStorageSync(careScopedKey('care-shared-favorites')) || []
}
async function readImage(source: string) {
  const builtinImage = careBuiltinImages.reference(source)
  if (builtinImage) return { builtinImage }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(source)
  const bytes = match ? new Uint8Array(Taro.base64ToArrayBuffer(match[2]))
    : source.startsWith(String(Taro.env.USER_DATA_PATH || '/invalid-local-root/')) || source.startsWith('wxfile://')
      ? new Uint8Array(Taro.getFileSystemManager().readFileSync(source) as ArrayBuffer) : null
  if (!bytes) throw new Error('图片需先保存到本机，才能上传到患者图库')
  return { data: Taro.arrayBufferToBase64(bytes.buffer as ArrayBuffer), sha256: bytesToHex(sha256(bytes)),
    type: match ? match[1] : bytes[0] === 137 ? 'image/png' : bytes[0] === 255 ? 'image/jpeg' : 'image/webp' }
}
function project(
  engine: ReturnType<typeof createCareSync>,
  expectedContext: NonNullable<ReturnType<typeof currentCareContext>>
) {
  assertCurrentSchemaReadable()
  const snapshot = engine.view()
  Taro.setStorageSync(careScopedKey('care-locked'), snapshot.locked)
  const current = currentCareContext()
  if (
    expectedContext.accountId !== 'offline' &&
    current?.accountId === expectedContext.accountId &&
    current.familyId === expectedContext.familyId &&
    current.profileId === expectedContext.profileId &&
    current.selection
  ) {
    saveCareSelection({
      ...current.selection,
      permissions: Array.isArray(snapshot.permissions)
        ? snapshot.permissions
        : [],
      locked: Boolean(snapshot.locked)
    })
  }
  if (snapshot.locked) Taro.setStorageSync(careScopedKey('care-shared-favorites'), [])
  if (!snapshot.locked) {
    const image = (asset: any) => {
      if (asset.builtinImage) return careBuiltinImages.resolve(asset.builtinImage)
      const path = `${Taro.env.USER_DATA_PATH}/care-picture-${bytesToHex(sha256(careScopedKey(asset.mediaId)))}.${asset.type === 'image/jpeg' ? 'jpg' : asset.type.split('/')[1]}`
      Taro.getFileSystemManager().writeFileSync(path, Taro.base64ToArrayBuffer(asset.data))
      return path
    }
    const cloudBoards = projectCareBoards(snapshot, image)
    const sameScope = current &&
      current.accountId === expectedContext.accountId &&
      current.familyId === expectedContext.familyId &&
      current.profileId === expectedContext.profileId
    const boards = sameScope
      ? preserveCareLocalTileMedia(
          cloudBoards,
          taroPictureLibraryStore.load(),
          current,
          expectedContext
        )
      : cloudBoards
    Taro.setStorageSync(careScopedKey('care-shared-favorites'), projectCareSharedPhrases(snapshot, currentCareContext()?.selection?.relationship?.role, image))
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
      if (hasCareFavoriteProjection(snapshot, kind) && !createTaroFavoriteStateStore().read().pending) repository.overwriteCommunicationSavedPhrases(preserveCareLocalFavoriteMedia(favorites.map((r: any) => ({ ...decodeCareMedia(r.value, snapshot.media, image), id: r.id, createdAt: r.value.createdAt || r.updatedAt || 1 })), repository.loadCommunicationSavedPhrases(), expectedContext, current || expectedContext))
      const preferences = snapshot.resources['preference:personalImagePreferences']
      if (preferences && !preferences.deleted && !Taro.getStorageSync(careScopedKey('care-pending-personalImagePreferences'))) repository.overwritePersonalImagePreferences(decodeCareMedia(preferences.value.value, snapshot.media, image))
    })
  }
  Taro.eventCenter.trigger('care-content-changed')
}
export async function synchronizeCareWorkspace(options: { localOnly?: boolean; automatic?: boolean } = {}) {
  if (pending) {
    if (!options.localOnly) return pending
    // A network failure must not prevent the final local queue flush for export.
    await pending.catch(() => undefined)
    return synchronizeCareWorkspace(options)
  }
  const context = currentCareContext()
  if (!context?.profileId) return
  assertCurrentSchemaReadable()
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
    let projectAfterSync = true
    try {
      const favoriteStore = createTaroFavoriteStateStore()
      const favoriteSnapshot = favoriteStore.read()
      if (!options.localOnly) assertSavedPhraseCapacity(favoriteSnapshot.phrases || [])
      const favorites = favoriteSnapshot.pending
      if (favorites) assertSavedPhraseCapacity(Array.isArray(favorites) ? favorites : favorites.items)
      const raw = Taro.getStorageSync(scoped('care-pending-boards'))
      if (raw) {
        await queueCareBoards(engine, JSON.parse(String(raw)), readImage)
        if (Taro.getStorageSync(scoped('care-pending-boards')) === raw) Taro.removeStorageSync(scoped('care-pending-boards'))
      }
      if (favorites) {
        const kind = context.selection?.relationship?.role === 'patient' ? 'favorite' : 'personalFavorite'
        const packet = favorites
        const items = Array.isArray(packet) ? packet : packet.items
        const base = Array.isArray(packet) ? undefined : packet.base
        for (const item of items) {
          const original = base?.find((entry: any) => entry.id === item.id)
          const old = engine.view().resources[`${kind}:${item.id}`]
          // A local baseline is not proof the engine persisted that item.
          // Keep an existing engine tombstone authoritative for unchanged data.
          if (old && original && sameCareFavoriteContent(original, item)) continue
          const value = await encodeCareMedia(item, engine, readImage)
          if (!old || JSON.stringify(old.value) !== JSON.stringify(value)) await engine.edit(kind, item.id, value)
        }
        const ids = new Set(items.map((item: any) => item.id))
        for (const r of Object.values(engine.view().resources) as any[]) if (r.kind === kind && !r.deleted && !ids.has(r.id) && (!base || base.some((entry: any) => entry.id === r.id))) await engine.edit(kind, r.id, null, 'delete')
        // Verify the existing sync engine's persisted receipt before releasing
        // the source packet. A queued in-memory edit is not a durable handoff.
        const receipt = await runtime.storage.get(`care-v1:${context.accountId}:${context.familyId}:${context.profileId}`)
        if (!receipt || JSON.stringify(JSON.parse(receipt)) !== JSON.stringify(engine.archive())) {
          throw new Error('收藏已保存到本机，同步待办交接尚未核对，请稍后重试同步。')
        }
        if (JSON.stringify(favoriteStore.read()) === JSON.stringify(favoriteSnapshot)) {
          favoriteStore.commit(favoriteSnapshot, { pending: null })
        }
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
          // A device popularity/manual ordering preference cannot move fixed
          // cells or silently turn their dense ID list into a different order.
          if (board && !board.deleted && !board.value.layout?.cells && JSON.stringify(board.value.tileIds) !== JSON.stringify(tileIds)) await engine.edit('board', id, { ...board.value, tileIds })
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
      // A password archive provides local content, never an online identity.
      if (context.accountId !== 'offline' && !options.localOnly) {
        const pauseKey = scoped('care-media-quota-paused')
        const paused = Boolean(Taro.getStorageSync(pauseKey))
        try {
          // The shared engine persists the upload pause with the media itself.
          // This local key only prevents repeated notices; it must never suppress
          // an upload after another Care view has successfully retried it.
          await engine.sync({ automatic: Boolean(options.automatic) })
          Taro.removeStorageSync(pauseKey)
          Taro.removeStorageSync(scoped('care-media-invalid-notice'))
        } catch (error: any) {
          const code = error?.data?.code
          if (['INVALID_MEDIA', 'INVALID_IMAGE', 'MEDIA_CHECKSUM_MISMATCH'].includes(code) && currentCareContext()?.accountId === context.accountId && careScopedKey('workspace') === key) {
            const noticeKey = scoped('care-media-invalid-notice')
            const previous = Taro.getStorageSync(noticeKey)
            Taro.setStorageSync(noticeKey, code)
            if (previous !== code || !options.automatic) {
              void Taro.showModal({ title: '有图片尚未同步', content: careErrorMessage(error), showCancel: false })
            }
          }
          if (error?.data?.code === 'FAMILY_MEDIA_QUOTA_EXCEEDED') {
            Taro.setStorageSync(pauseKey, true)
            if ((!paused || !options.automatic) && currentCareContext()?.accountId === context.accountId && careScopedKey('workspace') === key) {
              void Taro.showModal({ title: '云存储已满', content: '图片自动上传已暂停，本地内容仍保留。释放云端空间后，可在设置中手动同步重试；其他内容继续同步。', showCancel: false })
            }
          }
          throw error
        }
      }
    } catch (error: any) {
      if (error?.code === 'SAVED_PHRASE_CAPACITY') {
        projectAfterSync = false
        if (!options.automatic) void Taro.showModal({ title: '常用语同步已暂停', content: error.message, showCancel: false })
      }
      throw error
    } finally {
      if (projectAfterSync && currentCareContext()?.accountId === context.accountId && careScopedKey('workspace') === key) {
        try { project(engine, context) }
        catch (error: any) {
          if (error?.code === 'SAVED_PHRASE_CAPACITY' && !options.automatic) {
            void Taro.showModal({ title: '常用语同步已暂停', content: error.message, showCancel: false })
          }
          throw error
        }
      }
    }
  })().finally(() => { pending = null })
  return pending
}
export function startCareWorkspace() {
  if (stopWatch || !runtime.enabled) return
  configureCareCloudSync({ active: () => Boolean(currentCareContext()?.profileId), sync: synchronizeCareWorkspace })
  const base = apiBaseUrlFor('cloudFeatures')?.replace(/\/$/, '')
  Taro.addInterceptor(chain => {
    const params = chain.requestParams as typeof chain.requestParams & { __careAiRequestScope?: Parameters<typeof assertCareAiRequestScope>[0] }
    const frozen = params.__careAiRequestScope
    if (frozen) {
      // This local marker is consumed before the network boundary. Never let
      // a later account/profile/source selection rewrite an earlier request.
      delete params.__careAiRequestScope
      assertCareAiRequestScope(frozen)
      if (!['/gpt/communication/sentences', '/gpt/communication/resegment']
          .some(path => params.url === frozen.origin + path) ||
          params.header?.Authorization !== `Bearer ${frozen.token}` ||
          params.header?.['X-Care-Profile-Id'] !== frozen.profileId ||
          params.header?.['X-Care-Funding-Id'] !== frozen.fundingId) {
        throw Object.assign(new Error('AI_REQUEST_CONTEXT_CHANGED'), { code: 'AI_REQUEST_CONTEXT_CHANGED' })
      }
      return chain.proceed(params)
    }
    const context = currentCareContext()
    const fundingId = context?.profileId && runtime.funding(context.profileId)
    if (base && fundingId && context && params.url.startsWith(base + '/')) {
      params.header = { ...params.header, 'X-Care-Profile-Id': context.profileId, 'X-Care-Funding-Id': fundingId,
        'Idempotency-Key': params.header?.['Idempotency-Key'] || `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
    }
    return chain.proceed(params)
  })
  const update = () => { void synchronizeCareWorkspace({ automatic: true }).catch(() => undefined) }
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
