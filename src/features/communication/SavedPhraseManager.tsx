import { useEffect, useRef, useState } from 'react'
import Taro, { useDidHide } from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
import { filterSavedPhrasesByLifeContext, getCommunicationQuickPhrases } from '@cboard-communication-core/savedPhraseManagement'
import { filterSavedPhrasesByText } from '@cboard-communication-core/savedPhraseUse'
import { PATIENT_ACTION_IDS } from '@cboard-communication-core/patientActionLanguage'

import { careScopedKey } from '../../platform/taroCareContext'
import { taroCommunicationFilePort } from '../../platform/taroCommunicationFilePort'
import { wechatSpeechPort } from '../../platform/taroSpeechPort'
import type { CommunicationManagementService } from './management'
import PictogramImage from '../../components/PictogramImage'
import LifeContextFilter from './LifeContextFilter'
import PatientActionButton from './PatientActionButton'
import PhrasePlaybackOverlay from './PhrasePlaybackOverlay'
import './CommunicationManagement.css'

interface SavedPhraseManagerProps {
  service: CommunicationManagementService
  items: CommunicationSavedPhraseEntry[]
  speechRate: number
  onItemsChange: (items: CommunicationSavedPhraseEntry[]) => void
  onReuse: (item: CommunicationSavedPhraseEntry) => void
  initialLifeContext?: string | null
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
  onReuse,
  initialLifeContext = null
}: SavedPhraseManagerProps) {
  const [draft, setDraft] = useState('')
  const [importPreview, setImportPreview] = useState<ReturnType<CommunicationManagementService['previewSavedPhrases']> | null>(null)
  const epoch = useRef(0)
  useEffect(() => () => { epoch.current += 1; service.cancelSavedPhrasesImport() }, [service])
  const [notice, setNotice] = useState('可准备、复核修改、另存、朗读或导入导出。')
  const [busy, setBusy] = useState(false)
  const [lifeContext, setLifeContext] = useState<string | null>(initialLifeContext)
  const [query, setQuery] = useState('')
  const [undoState, setUndoState] = useState(() => service.savedPhraseUndoState())
  const undoPending = useRef(false)
  useEffect(() => { setUndoState(service.savedPhraseUndoState()) }, [service])
  const [playbackPhrase, setPlaybackPhrase] = useState<CommunicationSavedPhraseEntry | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const speechRun = useRef(0)
  const speechPending = useRef(false)
  const speechCounted = useRef(false)
  const stop = () => {
    speechRun.current += 1; speechPending.current = false
    wechatSpeechPort.stop(); setSpeaking(false)
  }
  useEffect(() => () => { speechRun.current += 1; speechPending.current = false; wechatSpeechPort.stop() }, [service])
  useDidHide(() => { stop(); setPlaybackPhrase(null) })
  const [contextEditingId, setContextEditingId] = useState('')
  const [contextDraft, setContextDraft] = useState('')
  const contextItems = filterSavedPhrasesByText(filterSavedPhrasesByLifeContext(items, lifeContext), query)
  const quickItems = getCommunicationQuickPhrases(contextItems, 6)
  const prepare = (request?: { id: string; mode: 'edit' | 'copy' }) => {
    const scope = careScopedKey('phrase-preparation')
    void Taro.navigateTo({ url: '/packages/caregiver/pages/receiver/index?prepare=1' + (request ? `&phraseId=${encodeURIComponent(request.id)}&phraseMode=${request.mode}` : ''), events: {
      prepared: ({ item, cleanupPending }: { item: CommunicationSavedPhraseEntry; cleanupPending?: boolean }) => {
        if (scope !== careScopedKey('phrase-preparation')) return
        onItemsChange(service.loadSavedPhrases())
        setLifeContext(item.lifeContext || '')
        setNotice(cleanupPending ? '已保存；草稿清理失败，重试不会重复收藏。' : `已定位：${item.sentence}。播报或载入由你主动选择。`)
        Taro.nextTick(() => { void Taro.pageScrollTo({ selector: `#saved-phrase-${item.id}`, duration: 0 }).catch(() => {}) })
      }
    }}).catch(() => setNotice('暂时无法打开准备页面，请重试。'))
  }

  const add = () => {
    const sentence = draft.trim()
    if (!sentence) {
      setNotice('请输入常用语文字。')
      return
    }
    try {
      const next = service.addSavedPhrase(sentence)
      onItemsChange(next)
      setDraft('')
      setNotice(next.length > items.length ? '常用语已保存到本机。' : '相同常用语已经存在。')
    } catch (error) { setNotice(`保存失败：${String(error)}；文字仍保留，请重试。`) }
  }

  const reuse = (item: CommunicationSavedPhraseEntry) => {
    onReuse(item)
  }

  const speak = async (item: CommunicationSavedPhraseEntry) => {
    if (speechPending.current) return
    const ticket = ++speechRun.current, scope = careScopedKey('phrase-playback')
    speechPending.current = true; setSpeaking(true)
    setNotice('正在朗读…')
    try {
      const result = await wechatSpeechPort.speak(item.sentence, { rate: speechRate })
      if (ticket !== speechRun.current || scope !== careScopedKey('phrase-playback')) return
      if (item.id && result.ok && !speechCounted.current) {
        speechCounted.current = true
        onItemsChange(service.markSavedPhraseUsed(item.id))
      }
      setNotice(result.message)
    } catch (_) {
      if (ticket === speechRun.current) setNotice('播报未完成，原句和图片仍保留。')
    } finally {
      if (ticket === speechRun.current) { speechPending.current = false; setSpeaking(false) }
    }
  }
  const openPhrase = (item: CommunicationSavedPhraseEntry, play = false) => {
    if (play && speechPending.current) return
    stop(); speechCounted.current = false
    setPlaybackPhrase(item)
    setNotice('仅查看，点击“播报整句”才会播放。')
    if (play) void speak(item)
  }
  const deletePhrase = (id: string) => {
    try { onItemsChange(service.deleteSavedPhrase(id)); setNotice('已删除，可以撤销。') }
    catch (error) { setNotice(`${String(error)}；恢复快照仍保留。`); onItemsChange(service.loadSavedPhrases()) }
    finally { setUndoState(service.savedPhraseUndoState()) }
  }
  const undoDelete = () => {
    if (!undoState.operationId || undoPending.current) return
    undoPending.current = true
    try { onItemsChange(service.undoSavedPhraseDelete(undoState.operationId)); setNotice('已恢复常用语，原句和图片保持不变。') }
    catch (error) { setNotice(String(error)) }
    finally {
      setUndoState(service.savedPhraseUndoState())
      void Promise.resolve().then(() => { undoPending.current = false })
    }
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
    const ticket = ++epoch.current, scope = careScopedKey('phrase-import')
    setImportPreview(null); service.cancelSavedPhrasesImport()
    setBusy(true)
    try {
      const file = await taroCommunicationFilePort.importText(['json'])
      if (ticket !== epoch.current || scope !== careScopedKey('phrase-import')) return
      if (!file.ok || !file.value) { setNotice(file.message); return }
      const preview = service.previewSavedPhrases(file.value)
      setImportPreview(preview); setNotice(preview.error || '请查看导入预览，确认后才会保存。')
    } catch (error) { setNotice(`导入失败：${String(error)}`) }
    finally { if (ticket === epoch.current) setBusy(false) }
  }
  const confirmImport = () => {
    try {
      const result = service.confirmSavedPhrasesImport()
      if (!result.committed) { setImportPreview(result); setNotice(result.message || result.error || '请重新确认'); return }
      onItemsChange(service.loadSavedPhrases()); setImportPreview(null)
      setNotice(`已导入 ${result.addedCount} 条，重复 ${result.duplicateCount} 条，无效 ${result.invalidCount} 条，缺少图片 ${result.missingPictogramCount} 个。`)
    } catch (error) { setNotice(`保存失败：${String(error)}；请重试。`) }
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

      <LifeContextFilter items={items} value={lifeContext} onChange={setLifeContext} />
      <Input ariaLabel='搜索常用语原句' placeholder='搜索常用语原句' value={query} onInput={event => setQuery(event.detail.value)} />
      <PatientActionButton action={PATIENT_ACTION_IDS.undo} outputIcon='undo'
        label={`撤销删除（${undoState.count}）`} ariaLabel='撤销上次删除的常用语'
        disabled={!undoState.count} onClick={undoDelete}
      />
      <Text>本次使用可连续撤销最近 20 次删除；刷新、退出或切换档案后结束。</Text>
      <Button className='button button--primary' onClick={() => prepare()}>准备常用表达</Button>
      <Text className='storage-notice'>收藏确认过的表达，再按生活情境整理。情境名称仅保存在本机。</Text>
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
        {contextItems.map(item => (
          <View className='phrase-manager__row' id={`saved-phrase-${item.id}`} key={item.id || item.sentence}>
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
            <View className='phrase-manager__copy'>
              <Text className='phrase-manager__sentence'>{item.sentence}</Text>
              <Text className='phrase-manager__usage'>使用 {item.usageCount || 0} 次</Text>
            </View>
            <View className='phrase-manager__actions'>
              <Button className='review-action' onClick={() => { setContextEditingId(item.id || ''); setContextDraft(item.lifeContext || '') }}>情境：{item.lifeContext || '未分类'}</Button>
              <Button id={`saved-phrase-use-${item.id}`} className='review-action' onClick={() => reuse(item)}>使用</Button>
              <Button className='review-action' onClick={() => openPhrase(item)}>查看整句</Button>
              <Button className='review-action' onClick={() => openPhrase(item, true)}>一键播报</Button>
              <Button className='review-action' onClick={() => { if (item.id) prepare({ id: item.id, mode: 'edit' }) }}>修改这条</Button>
              <Button className='review-action' onClick={() => { if (item.id) prepare({ id: item.id, mode: 'copy' }) }}>以此准备新句</Button>
              <Button
                className='review-action review-action--delete'
                disabled={!item.id || Boolean(item.careSharedReadOnly)}
                onClick={() => {
                  if (item.id) deletePhrase(item.id)
                }}
              >删除</Button>
            </View>
            {contextEditingId === item.id && <View aria-label='编辑生活情境'>
              <Input className='phrase-manager__input' value={contextDraft} maxlength={40}
                placeholder='生活情境，如吃饭、散步；留空为未分类' onInput={event => setContextDraft(event.detail.value)}
              />
              <Button className='review-action' onClick={() => {
                try {
                  if (item.id) onItemsChange(service.assignLifeContext(item.id, contextDraft))
                  setContextEditingId(''); setNotice('生活情境已保存在本机，原句和图片未改变。')
                } catch (error) { setNotice(`保存失败：${String(error)}；情境修改仍保留，请重试。`) }
              }}
              >保存情境</Button>
              <Button className='review-action' onClick={() => setContextEditingId('')}>取消</Button>
            </View>}
          </View>
        ))}
      </View>
      {!contextItems.length && <Text className='storage-notice'>这个情境还没有常用语，可切回全部进行整理。</Text>}

      {importPreview && <View aria-label='常用语导入预览'>
        <Text>预计新增 {importPreview.wouldAddCount || 0} 条；重复 {importPreview.duplicateCount || 0} 条；无效 {importPreview.invalidCount || 0} 条；缺少图片 {importPreview.missingPictogramCount || 0} 个；剩余容量 {importPreview.availableSlots || 0} 条。</Text>
        {importPreview.error && <Text>{importPreview.error}</Text>}
        <Button disabled={Boolean(importPreview.capacityExceeded || importPreview.error)} onClick={confirmImport}>确认整批导入</Button>
        <Button onClick={() => { epoch.current += 1; service.cancelSavedPhrasesImport(); setImportPreview(null) }}>取消导入</Button>
      </View>}
      <View className='phrase-manager__transfer'>
        <Button className='button button--outline' disabled={busy} onClick={() => void exportJson()}>
          导出 JSON
        </Button>
        <Button className='button button--outline' disabled={busy} onClick={() => void importJson()}>
          导入 JSON
        </Button>
      </View>
      <Text className='storage-notice'>{notice}</Text>
      <PhrasePlaybackOverlay item={playbackPhrase} isSpeaking={speaking} status={notice}
        onReplay={async () => { if (playbackPhrase) await speak(playbackPhrase) }}
        onClose={() => { stop(); setPlaybackPhrase(null); setNotice('已返回，当前表达保持不变。') }}
      />
    </View>
  )
}
