import { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'

import { APP_UPDATE_STATUS } from '../../platform/appUpdatePort'
import { taroAppUpdatePort } from '../../platform/taroAppUpdatePort'

export default function AppUpdateBanner() {
  const [status, setStatus] = useState(taroAppUpdatePort.getStatus())

  useEffect(() => taroAppUpdatePort.subscribe(setStatus), [])

  if (status !== APP_UPDATE_STATUS.ready) return null

  return (
    <View
      id='app-update-banner'
      className='app-update-banner'
      role='alert'
    >
      <Text className='app-update-banner__message'>
        新版本已经准备好
      </Text>
      <View className='app-update-banner__actions'>
        <Button
          id='app-update-apply'
          className='app-update-banner__button app-update-banner__button--apply'
          onClick={() => taroAppUpdatePort.applyUpdate()}
        >
          立即更新
        </Button>
        <Button
          id='app-update-dismiss'
          className='app-update-banner__button'
          onClick={() => taroAppUpdatePort.dismiss()}
        >
          稍后
        </Button>
      </View>
    </View>
  )
}
