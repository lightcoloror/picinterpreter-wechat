import { Button, View } from '@tarojs/components'
import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
import { getSavedPhraseLifeContexts } from '@cboard-communication-core/savedPhraseManagement'

export default function LifeContextFilter({items, value, onChange}: {
  items: CommunicationSavedPhraseEntry[]
  value: string | null
  onChange: (context: string | null) => void
}) {
  const choices = [{value: null, label: '全部'}, {value: '', label: '未分类'},
    ...getSavedPhraseLifeContexts(items).map(context => ({value: context, label: context}))]
  return <View className='phrase-manager__actions' aria-label='生活情境筛选'>
    {choices.map(choice => <Button key={choice.value === null ? '__all' : `context:${choice.value}`}
      className={value === choice.value ? 'button button--primary' : 'review-action'}
      aria-label={`${choice.label}${value === choice.value ? '，已选择' : ''}`}
      onClick={() => onChange(choice.value)}
    >{choice.label}</Button>)}
  </View>
}
