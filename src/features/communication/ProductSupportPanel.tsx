import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { productSupportTarget } from '../../platform/productSupport'

export default function ProductSupportPanel() {
  const [notice, setNotice] = useState('')
  const target = productSupportTarget()
  const copy = async () => {
    if (!target) return
    try {
      await Taro.setClipboardData({ data: target.value })
      setNotice(target.kind === 'email' ? '邮箱已复制，请在邮件应用中发送反馈。' : '链接已复制，请在浏览器中打开反馈页面。')
    } catch (_) { setNotice('复制失败，请长按下方地址复制。') }
  }
  return <View className='settings-row settings-row--stack'>
    <Text className='settings-row__label'>联系图语家 · 问题反馈</Text>
    <Text className='settings-row__hint'>请描述遇到的问题；不要附上患者姓名、病历、照片或沟通记录。这里不会自动发送任何资料。</Text>
    {target ? <>
      <Text selectable>{target.value}</Text>
      <Button onClick={copy}>{target.kind === 'email' ? '复制反馈邮箱' : '复制反馈链接'}</Button>
    </> : <Text>反馈入口尚未开放。</Text>}
    {notice && <Text>{notice}</Text>}
  </View>
}
