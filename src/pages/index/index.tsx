import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import './index.css'

export default function LaunchPage() {
  const [notice, setNotice] = useState('正在打开患者表达图板')

  useDidShow(() => {
    void Taro.redirectTo({
      url: '/packages/caregiver/pages/patient/index'
    }).catch(() => {
      setNotice('暂时无法打开沟通图板，请关闭小程序后重试。')
    })
  })

  return (
    <View className='launch-page'>
      <View className='launch-page__mark'>图</View>
      <Text className='launch-page__title'>图语家</Text>
      <Text className='launch-page__notice'>{notice}</Text>
    </View>
  )
}
