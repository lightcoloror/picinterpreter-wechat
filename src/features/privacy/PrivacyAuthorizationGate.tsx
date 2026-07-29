import { useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import {
  createPrivacyAuthorizationQueue,
  type PrivacyAuthorizationResolver
} from './privacyAuthorizationQueue'
import './PrivacyAuthorizationGate.css'

const AGREE_BUTTON_ID = 'privacy-authorize-agree'

export default function PrivacyAuthorizationGate() {
  const [visible, setVisible] = useState(false)
  const queueRef = useRef(
    createPrivacyAuthorizationQueue(setVisible)
  )

  useEffect(() => {
    if (typeof Taro.onNeedPrivacyAuthorization !== 'function') return

    Taro.onNeedPrivacyAuthorization(resolve => {
      queueRef.current.enqueue(
        resolve as PrivacyAuthorizationResolver
      )
    })
  }, [])

  if (!visible) return null

  const openPrivacyContract = () => {
    Taro.openPrivacyContract({
      fail: () => {
        void Taro.showToast({
          title: '请先在公众平台配置隐私保护指引',
          icon: 'none'
        })
      }
    })
  }

  return (
    <View className='privacy-authorization' catchMove>
      <View className='privacy-authorization__dialog'>
        <Text className='privacy-authorization__eyebrow'>
          图语家 · 权限说明
        </Text>
        <Text className='privacy-authorization__title'>
          使用这项功能前，请阅读隐私保护指引
        </Text>
        <Text className='privacy-authorization__body'>
          图语家只会在您主动使用录音、选图、相机或文件功能时申请对应权限。拒绝后仍可继续使用不需要该权限的本地沟通功能。
        </Text>
        <Button
          className='privacy-authorization__contract'
          onClick={openPrivacyContract}
        >
          查看《用户隐私保护指引》
        </Button>
        <View className='privacy-authorization__actions'>
          <Button
            className='privacy-authorization__button privacy-authorization__button--secondary'
            onClick={() => queueRef.current.settle('disagree')}
          >
            暂不同意
          </Button>
          <Button
            id={AGREE_BUTTON_ID}
            className='privacy-authorization__button privacy-authorization__button--primary'
            openType='agreePrivacyAuthorization'
            onAgreePrivacyAuthorization={() =>
              queueRef.current.settle('agree', AGREE_BUTTON_ID)
            }
          >
            同意并继续
          </Button>
        </View>
      </View>
    </View>
  )
}
