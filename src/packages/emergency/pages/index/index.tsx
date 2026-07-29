import Taro from '@tarojs/taro'

import EmergencyPage from '../../../../features/communication/EmergencyPage'
import {
  taroCommunicationPreferencesStore
} from '../../../../platform/taroCommunicationPreferencesStore'

export default function EmergencyCommunicationPage() {
  const preferences = taroCommunicationPreferencesStore.load()

  const close = () => {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({
        url: '/packages/caregiver/pages/patient/index'
      })
    )
  }

  return (
    <EmergencyPage
      speechRate={preferences.speechRate}
      onClose={close}
    />
  )
}
