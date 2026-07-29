import { useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'

import { taroCommunicationFilePort } from '../../platform/taroCommunicationFilePort'
import { wechatSpeechPort } from '../../platform/taroSpeechPort'
import type { CommunicationManagementService } from './management'
import PictogramImage from '../../components/PictogramImage'
import './CommunicationManagement.css'

interface SavedPhraseManagerProps {
  service: CommunicationManagementService
  items: CommunicationSavedPhraseEntry[]
  speechRate: number
  onItemsChange: (items: CommunicationSavedPhraseEntry[]) => void
  onReuse: (item: CommunicationSavedPhraseEntry) => void
}

function dateTag() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export default function SavedPhraseManager({
  service,
  items,
  speechRate,
  onItemsChange,
  onReuse
}: SavedPhraseManagerProps) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingSentence, setEditingSentence] = useState('')
  const [notice, setNotice] = useState('可新增、改名、删除、朗读或导入导出。')
  const [busy, setBusy] = useState(false)
  const quickItems = service.getQuickPhrases(6)

  const add = () => {
    const sentence = draft.trim()
    if (!sentence) {
      setNotice('请输入常用语文字。')
      return
    }
    const next = service.addSavedPhrase(sentence)
    onItemsChange(next)
    setDraft('')
    setNotice(next.length > items.length ? '常用语已新增。' : '相同常用语已经存在。')
  }

  const reuse = (item: CommunicationSavedPhraseEntry) => {
    onReuse(item)
  }

  const speak = async (item: CommunicationSavedPhraseEntry) => {
    setNotice('正在朗读…')
    const result = await wechatSpeechPort.speak(item.sentence, { rate: speechRate })
    if (item.id && result.ok) onItemsChange(service.markSavedPhraseUsed(item.id))
    setNotice(result.message)
  }

  const exportJson = async () => {
    setBusy(true)
    const result = await taroCommunicationFilePort.exportText(
      `图语家_常用语_${dateTag()}.json`,
      service.exportSavedPhrases()
    )
    setBusy(false)
    setNotice(result.message)
  }

  const importJson = async () => {
    setBusy(true)
    const file = await taroCommunicationFilePort.importText(['json'])
    if (!file.ok || !file.value) {
      setBusy(false)
      setNotice(file.message)
      return
    }
    const result = service.importSavedPhrases(file.value)
    setBusy(false)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    onItemsChange(service.loadSavedPhrases())
    setNotice(
      `导入 ${result.addedCount} 条，跳过 ${result.skippedCount} 条，缺少图片 ${result.missingPictogramCount} 个。`
    )
  }

  return (
    <View className='panel phrase-manager'>
      <View className='section-heading'>
        <Text className='section-heading__index'>常</Text>
        <View>
          <Text className='section-heading__title'>常用语管理</Text>
          <Text className='section-heading__hint'>高频前 6 条优先显示，数据保存在当前设备</Text>
        </View>
      </View>

      {!!quickItems.length && (
        <ScrollView scrollX className='phrase-manager__quick-scroll'>
          <View className='phrase-manager__quick-list'>
            {quickItems.map(item => (
              <Button
                className='phrase-manager__quick'
                key={item.id || item.sentence}
                onClick={() => reuse(item)}
              >
                {item.sentence}
              </Button>
            ))}
          </View>
        </ScrollView>
      )}

      <View className='phrase-manager__add'>
        <Input
          className='phrase-manager__input'
          value={draft}
          maxlength={120}
          placeholder='输入一句常用语，例如：请帮帮我'
          onInput={event => setDraft(event.detail.value)}
        />
        <Button className='button button--primary' onClick={add}>新增</Button>
      </View>

      <View className='phrase-manager__list'>
        {items.map(item => (
          <View className='phrase-manager__row' key={item.id || item.sentence}>
            <View className='phrase-manager__images'>
              {item.output.slice(0, 3).map((tile, index) => (
                <PictogramImage
                  className='phrase-manager__image'
                  key={`${tile.id}-${index}`}
                  src={tile.image}
                  label={tile.label}
                  mediaType={tile.mediaType}
                  video={tile.video}
                />
              ))}
            </View>
            {editingId && editingId === item.id ? (
              <Input
                className='phrase-manager__input'
                value={editingSentence}
                maxlength={120}
                onInput={event => setEditingSentence(event.detail.value)}
              />
            ) : (
              <View className='phrase-manager__copy'>
                <Text className='phrase-manager__sentence'>{item.sentence}</Text>
                <Text className='phrase-manager__usage'>使用 {item.usageCount || 0} 次</Text>
              </View>
            )}
            <View className='phrase-manager__actions'>
              <Button className='review-action' onClick={() => reuse(item)}>使用</Button>
              <Button className='review-action' onClick={() => void speak(item)}>朗读</Button>
              {editingId === item.id ? (
                <Button
                  className='review-action'
                  onClick={() => {
                    if (item.id) {
                      onItemsChange(service.renameSavedPhrase(item.id, editingSentence))
                    }
                    setEditingId('')
                    setNotice('常用语名称已更新。')
                  }}
                >保存</Button>
              ) : (
                <Button
                  className='review-action'
                  onClick={() => {
                    setEditingId(item.id || '')
                    setEditingSentence(item.sentence)
                  }}
                >改名</Button>
              )}
              <Button
                className='review-action review-action--delete'
                disabled={!item.id}
                onClick={() => {
                  if (item.id) onItemsChange(service.deleteSavedPhrase(item.id))
                  setNotice('常用语已删除。')
                }}
              >删除</Button>
            </View>
          </View>
        ))}
      </View>

      <View className='phrase-manager__transfer'>
        <Button className='button button--outline' disabled={busy} onClick={() => void exportJson()}>
          导出 JSON
        </Button>
        <Button className='button button--outline' disabled={busy} onClick={() => void importJson()}>
          导入 JSON
        </Button>
      </View>
      <Text className='storage-notice'>{notice}</Text>
    </View>
  )
}
