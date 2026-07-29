import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import {
  getCommunicationNetworkStatusCopy
} from '@cboard-communication-core/networkStatus'

import type {
  CommunicationNetworkStatus,
  NetworkStatusPort
} from '../../platform/networkStatusPort'
import { taroNetworkStatusPort } from '../../platform/taroNetworkStatusPort'

interface NetworkStatusNoticeProps {
  port?: NetworkStatusPort
}

const UNKNOWN_STATUS: CommunicationNetworkStatus = {
  availability: 'unknown',
  networkType: 'unknown'
}

export default function NetworkStatusNotice({
  port = taroNetworkStatusPort
}: NetworkStatusNoticeProps) {
  const [status, setStatus] = useState(UNKNOWN_STATUS)

  useEffect(() => {
    let active = true
    let receivedChange = false
    const unsubscribe = port.subscribe(nextStatus => {
      receivedChange = true
      if (active) setStatus(nextStatus)
    })

    void port.getCurrent().then(nextStatus => {
      if (active && !receivedChange) setStatus(nextStatus)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [port])

  const copy = getCommunicationNetworkStatusCopy(status)
  if (!copy) return null

  return (
    <View id='offline-status-notice' className='network-status' role='status'>
      <Text className='network-status__title'>{copy.title}</Text>
      <Text className='network-status__detail'>
        {copy.detail}
      </Text>
    </View>
  )
}
