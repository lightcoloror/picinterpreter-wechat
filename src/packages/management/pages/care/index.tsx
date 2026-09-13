import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { View, Text, Button, Input, Image } from '@tarojs/components'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import CarePanel from '@cboard-communication-core/CarePanel'




import { identity, runtime } from '../../../../platform/taroCareRuntime'

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
  Input: ({ onValue, type, ...props }: any) => <Input {...props} type={type === 'password' ? 'text' : type} password={type === 'password'} onInput={e => onValue(e.detail.value)} />,
  Image: CareImage }
export default function CarePage() { return <View style={{ padding: '16px' }}><CarePanel runtime={runtime} ui={ui} /></View> }
