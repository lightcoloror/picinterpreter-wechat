import Taro from '@tarojs/taro'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { createCareSync } from '@cboard-communication-core/careSync'
import { taroCboardSessionStore } from './taroCboardAccountPort'
import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { wechatSpeechPort } from './taroSpeechPort'
import { saveCareSelection, type CareSelection } from './taroCareContext'

export const identity = () => {
  const s = taroCboardSessionStore.load()
  return s?.user.id ? { id: s.user.id, token: s.token } : null
}

function requestError(status: number, data: unknown) {
  const message = status === 401
    ? '登录已失效，请重新登录。'
    : status === 403
      ? '当前账号无权访问此患者资料。'
      : status === 503
        ? '云端服务暂时不可用，请稍后重试。'
        : '连接失败'
  return Object.assign(new Error(message), { status, data })
}
export const runtime = {
  enabled: process.env.TARO_APP_CARE_COLLABORATION === 'true',
  identity,
  randomBytes: async (length: number) => new Uint8Array((await Taro.getRandomValues({ length })).randomValues),
  funding(profileId: string) { const who = identity(); return who ? Taro.getStorageSync(`care-funding-v1:${who.id}:${profileId}`) : null },
  setFunding(profileId: string, fundingId: string) { const who = identity(); if (who) Taro.setStorageSync(`care-funding-v1:${who.id}:${profileId}`, fundingId) },
  async selectProfile(profile: CareSelection) {
    const accountId = identity()?.id
    if (!accountId) throw Object.assign(new Error('请先登录'), { status: 401 })
    try { await runtime.request('/care/context', 'PUT', { profileId: profile.id }) }
    catch (error: any) { if (error.status) throw error }
    if (identity()?.id !== accountId) throw Object.assign(new Error('账号已切换，请重新选择档案'), { status: 401 })
    saveCareSelection(profile)
  },
  async saveArchive(bytes: Uint8Array) {
    const path = `${Taro.env.USER_DATA_PATH}/tuyujia-device-${Date.now()}.zip`
    Taro.getFileSystemManager().writeFileSync(path, bytes.slice().buffer as ArrayBuffer)
    await Taro.shareFileMessage({ filePath: path, fileName: 'tuyujia-device.zip' })
  },
  async offlineArchive() {
    const selected = Taro.getStorageSync('care-offline-selection-v1')
    if (!selected) throw new Error('本机尚未恢复患者备份')
    const workspace = await import('./taroCareWorkspace')
    await workspace.synchronizeCareWorkspace().catch(() => undefined)
    const engine = createCareSync({ accountId: 'offline', profileId: selected.id, familyId: selected.familyId,
      storage: runtime.storage, request: runtime.request, newId: runtime.newId, currentAccount: () => 'offline' })
    await engine.init()
    return { identity: { profileId: selected.id, familyId: selected.familyId }, snapshot: engine.archive() }
  },
  async restoreOffline(preview: any) {
    const old = Taro.getStorageSync('care-offline-selection-v1')
    if (old && (old.id !== preview.profileId || old.familyId !== preview.familyId)) throw new Error('本机已有另一患者资料，请使用独立设备空间。')
    const engine = createCareSync({ accountId: 'offline', profileId: preview.profileId, familyId: preview.familyId,
      storage: runtime.storage, request: runtime.request, newId: runtime.newId, currentAccount: () => 'offline' })
    await engine.init(); await engine.importPreview(preview)
    Taro.setStorageSync('care-offline-selection-v1', { id: preview.profileId, familyId: preview.familyId,
      name: '离线恢复的患者', relationship: preview.relationship || { role: 'patient', defaultMode: 'expression' } })
    await Taro.reLaunch({ url: '/pages/index/index' })
  },
  newId: async () => bytesToHex(new Uint8Array((await Taro.getRandomValues({ length: 16 })).randomValues)),
  storage: {
    // File replacement keeps large offline media outside the small settings KV quota.
    async get(key: string) {
      const path = `${Taro.env.USER_DATA_PATH}/care-${bytesToHex(sha256(key))}.json`
      try { return String(Taro.getFileSystemManager().readFileSync(path, 'utf8')) } catch (_) { return null }
    },
    async set(key: string, value: string) {
      const path = `${Taro.env.USER_DATA_PATH}/care-${bytesToHex(sha256(key))}.json`
      const fs = Taro.getFileSystemManager()
      fs.writeFileSync(`${path}.tmp`, value, 'utf8')
      fs.renameSync(`${path}.tmp`, path)
    }
  },
  async request(path: string, method: any, body?: any) {
    const who = identity()
    if (!who) throw Object.assign(new Error('请先登录'), { status: 401 })
    const base = apiBaseUrlFor('cloudFeatures')
    if (!base) throw new Error('云端服务尚未配置')
    const response = await Taro.request({ url: base.replace(/\/$/, '') + path, method, data: body,
      timeout: 20000, header: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` } })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      // A delayed response from an older login must never clear a newer session.
      if (response.statusCode === 401) {
        const current = identity()
        if (current?.id === who.id && current.token === who.token) taroCboardSessionStore.clear()
      }
      throw requestError(response.statusCode, response.data)
    }
    return response.data
  },
  watch(callback: () => void) {
    let foreground = true
    const show = () => { foreground = true; callback() }
    const hide = () => { foreground = false }
    const network = (event: { isConnected: boolean }) => { if (event.isConnected && foreground) callback() }
    Taro.onAppShow(show); Taro.onAppHide(hide); Taro.onNetworkStatusChange(network)
    const timer = setInterval(() => { if (foreground) callback() }, 30000)
    return () => { clearInterval(timer); Taro.offAppShow(show); Taro.offAppHide(hide); Taro.offNetworkStatusChange(network) }
  },
  async chooseImage() {
    const selected = await Taro.chooseMedia({ count: 1, mediaType: ['image'] })
    const file = selected.tempFiles[0]
    if (file.size > 4 * 1024 * 1024) throw new Error('请选择不超过4 MiB的图片')
    const fs = Taro.getFileSystemManager()
    const bytes = new Uint8Array(fs.readFileSync(file.tempFilePath) as ArrayBuffer)
    const type = bytes[0] === 137 ? 'image/png' : bytes[0] === 255 ? 'image/jpeg' : 'image/webp'
    return { data: Taro.arrayBufferToBase64(bytes.buffer), sha256: bytesToHex(sha256(bytes)), type }
  },
  async chooseArchive() {
    const selected = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['zip'] })
    const file = selected.tempFiles[0]
    if (file.size > 20 * 1024 * 1024) throw new Error('请选择不超过20 MiB的图库备份')
    return new Uint8Array(Taro.getFileSystemManager().readFileSync(file.path) as ArrayBuffer)
  },
  speak: async (text: string, rate: number) => { const result = await wechatSpeechPort.speak(text, { rate });
    if (!result.ok) throw new Error(result.message || '此设备暂时无法播报，请使用图文表达。') },
  confirm: async (content: string) => (await Taro.showModal({ title: '患者协作', content })).confirm,
  copy: async (data: string) => { await Taro.setClipboardData({ data }) },
  logout: () => taroCboardSessionStore.clear()
}
