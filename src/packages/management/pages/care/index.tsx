import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { View, Text, Button, Input, Image } from '@tarojs/components'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import CarePanel from '@cboard-communication-core/CarePanel'
import { taroCboardSessionStore } from '../../../../platform/taroCboardAccountPort'
import { apiBaseUrlFor } from '../../../../config/runtimeCapabilities'
import { wechatSpeechPort } from '../../../../platform/taroSpeechPort'

const identity = () => {
  const s = taroCboardSessionStore.load()
  return s?.user.id ? { id: s.user.id, token: s.token } : null
}
const runtime = {
  enabled: process.env.TARO_APP_CARE_COLLABORATION === 'true',
  identity,
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
    if (response.statusCode < 200 || response.statusCode >= 300) throw Object.assign(
      new Error((response.data as any)?.code || '连接失败'), { status: response.statusCode, data: response.data })
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
function CareImage({ src }: { src: string }) {
  const [file, setFile] = useState('')
  useEffect(() => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(src)
    if (!match) { setFile(''); return }
    const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1]
    const path = `${Taro.env.USER_DATA_PATH}/care-render-${bytesToHex(sha256((identity()?.id || '') + src))}.${extension}`
    try {
      Taro.getFileSystemManager().writeFileSync(path, Taro.base64ToArrayBuffer(match[2]))
      setFile(path)
    } catch (_) { setFile('') }
    return () => { try { Taro.getFileSystemManager().unlinkSync(path) } catch (_) {} }
  }, [src])
  return file ? <Image src={file} mode='aspectFit' style={{ width: '150px', height: '150px' }} /> : <Text>图片尚未缓存</Text>
}
const ui = { Box: View, Text, Button,
  Input: ({ onValue, ...props }: any) => <Input {...props} onInput={e => onValue(e.detail.value)} />,
  Image: CareImage }
export default function CarePage() { return <View style={{ padding: '16px' }}><CarePanel runtime={runtime} ui={ui} /></View> }
