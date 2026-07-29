import { Text, View } from '@tarojs/components'
import {
  getCommunicationHistoryPatientFeedbackText
} from '@cboard-communication-core/historyManagement'
import type { CommunicationHistoryEntry } from '@cboard-communication-core/repository'

interface HistoryPanelProps {
  items: CommunicationHistoryEntry[]
}

export default function HistoryPanel({ items }: HistoryPanelProps) {
  const recentItems = items.slice(0, 5)

  return (
    <View className='panel history-panel'>
      <View className='section-heading'>
        <Text className='section-heading__index'>记</Text>
        <View>
          <Text className='section-heading__title'>最近沟通</Text>
          <Text className='section-heading__hint'>表达与接收记录统一保存在当前设备</Text>
        </View>
      </View>

      {recentItems.length ? (
        <View className='history-list'>
          {recentItems.map((item, index) => (
            <View className='history-row' key={`${item.createdAt || 0}-${index}`}>
              <Text className={`history-row__direction history-row__direction--${item.direction}`}>
                {item.direction === 'receive' ? '接收' : '表达'}
              </Text>
              <View className='history-row__content'>
                <Text className='history-row__text'>
                  {item.sentence || item.inputText || item.labels.join(' / ')}
                </Text>
                {!!item.labels.length && (
                  <Text className='history-row__labels'>{item.labels.join(' · ')}</Text>
                )}
                {!!getCommunicationHistoryPatientFeedbackText(item) && (
                  <Text className={`history-row__feedback history-row__feedback--${item.patientFeedback}`}>
                    {getCommunicationHistoryPatientFeedbackText(item)}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text className='history-list__empty'>还没有已确认的沟通记录。</Text>
      )}
    </View>
  )
}
