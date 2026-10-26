import { useEffect, useRef, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import { SAVED_PHRASE_STARTERS, createSavedPhrasePreparationService } from '@cboard-communication-core/savedPhrasePreparation'
import { DEFAULT_LIFE_CONTEXTS } from '@cboard-communication-core/savedPhraseManagement'
import type { CommunicationRepository, CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
import type { ReceiverHistoryEntry } from '@cboard-communication-core/receiverPipeline'
import ReceiverWorkspace, { type ReceiverWorkspaceProps } from './ReceiverWorkspace'
import { restoreReceiverWorkspaceFromRecord } from './receiverSession'

interface Props {
  initialRequest?: { id: string; mode: 'edit' | 'copy' }
  repository: CommunicationRepository
  getScopeKey: () => string
  receiverProps: ReceiverWorkspaceProps
  onInvalidate: () => void
  onClose: () => void
  onSaved: (item: CommunicationSavedPhraseEntry, cleanupPending?: boolean) => void
}
export default function SavedPhrasePreparation({ repository, getScopeKey, receiverProps, onInvalidate, onClose, onSaved, initialRequest }: Props) {
  const [service] = useState(() => createSavedPhrasePreparationService({ repository, getScopeKey }))
  const [initial] = useState(() => { try { return { draft: service.load(), error: '' } } catch (error) { return { draft: null, error: `准备草稿读取失败，原数据已保留：${String(error)}` } } })
  const [draft, setDraft] = useState(initial.draft)
  const [loadError, setLoadError] = useState(initial.error)
  const [contextError, setContextError] = useState('')
  const [continuing, setContinuing] = useState(false)
  const [notice, setNotice] = useState('参考表达只是起点，请改成自己的说法并复核；不会自动加入收藏。')
  const [duplicate, setDuplicate] = useState<CommunicationSavedPhraseEntry | null>(null)
  const [conflict, setConflict] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (initialRequest && !draft && !loadError) {
      try { setDraft(service.startFromSavedPhrase(initialRequest.id, initialRequest.mode)); setContinuing(true) }
      catch (error) { setNotice(String(error)) }
    }
  }, [initialRequest, service, draft, loadError])
  const editing = draft?.preparationMode === 'edit'
  const saveLabel = editing ? '确认更新这条常用语' : draft?.preparationMode === 'copy' ? '确认另存为新常用语' : '确认存为常用语'
  const saving = useRef(false)
  const completed = useRef(false)
  const change = (entry: ReceiverHistoryEntry, context?: string) => {
    if (!draft) throw new Error('准备草稿已关闭。')
    setDraft(current => current ? { ...current, ...entry,
      lifeContext: context === undefined ? current.lifeContext : context } : current)
    const next = service.update(draft.id, entry, context === undefined ? draft.lifeContext : context)
    setDraft(next)
    setContextError('')
    return next
  }
  const discard = () => {
    try {
      if (draft) service.discard(draft.id)
      onInvalidate(); setDraft(null); setContinuing(false); setDuplicate(null)
      setNotice('已丢弃准备草稿；已有收藏、沟通记录和图库图片保持不变。')
    } catch (error) { setNotice(String(error)) }
  }
  const later = () => {
    try { if (draft) service.update(draft.id, draft, draft.lifeContext); onInvalidate(); onClose() }
    catch (error) { setNotice(`草稿保存失败：${String(error)}`) }
  }
  const commit = (entry: ReceiverHistoryEntry) => {
    if (!draft || saving.current || completed.current) return false
    saving.current = true
    try {
      const result = service.commit(draft.id, entry)
      if (!result.ok || !result.item) { setDuplicate(result.duplicate || null); setConflict(Boolean(result.conflict)); setNotice(result.message || '保存失败，草稿已保留。'); return false }
      completed.current = true
      onInvalidate(); onSaved(result.item, result.cleanupPending)
      return true
    } catch (error) { setNotice(`保存失败：${String(error)}`); return false }
    finally { saving.current = false }
  }
  return <View className='panel phrase-manager'>
    <Text className='section-heading__title'>准备常用表达</Text>
    <Text className='storage-notice'>{notice}</Text>
    {loadError && <View><Text>{loadError}</Text><Button onClick={() => { try { setDraft(service.load()); setLoadError('') } catch (error) { setLoadError(String(error)) } }}>重试读取草稿</Button></View>}
    {draft?.sourceSnapshot && <Text>原收藏：{draft.sourceSnapshot.sentence}。{editing ? '复核后仅更新这条收藏，过去的沟通记录不变。' : '另存新句，原收藏不变。'} 原图没有可靠文字位置；修改文字后请重新匹配或人工复核。</Text>}
    {conflict && <Button onClick={() => { try { if (draft) setDraft(service.convertToCopy(draft.id)); setConflict(false) } catch (error) { setNotice(String(error)) } }}>改为另存新句</Button>}
    {duplicate && <Button onClick={() => { onInvalidate(); onSaved(duplicate) }}>查看已有收藏</Button>}
    {loadError ? null : draft && !continuing ? <View>
      <Text>已有准备草稿：{draft.inputText || '（尚未填写文字）'}</Text>
      <Button className='button button--primary' onClick={() => setContinuing(true)}>继续准备</Button>
      <Button onClick={discard}>丢弃后重新选择</Button>
    </View> : !draft ? <View>
      {DEFAULT_LIFE_CONTEXTS.map(context => <View key={context}>
        <Text className='section-heading__title'>{context}</Text>
        {SAVED_PHRASE_STARTERS.filter(item => item.lifeContext === context).map(item =>
          <Button key={item.id} onClick={() => {
            try { setDraft(service.start(item.id)); setContinuing(true); setDuplicate(null) }
            catch (error) { setNotice(String(error)) }
          }}
          >{item.text}</Button>)}
      </View>)}
    </View> : <View>
      <Text>生活情境</Text>
      <Input id='prepared-phrase-life-context' value={draft.lifeContext} placeholder='生活情境' onInput={event => {
        try { change(draft, event.detail.value) } catch (error) { setContextError(`当前生活情境尚未保存：${String(error)}`) }
      }}
      />
      {contextError && <View><Text>{contextError}</Text><Button onClick={() => { try { change(draft, draft.lifeContext) } catch (error) { setContextError(String(error)) } }}>重试保存情境</Button></View>}
      <ReceiverWorkspace {...receiverProps} key={draft.id} preparationMode externalSaveError={contextError} preparationSaveLabel={saveLabel}
        initialState={restoreReceiverWorkspaceFromRecord(draft, receiverProps.boards)} receiverRecords={[]}
        imageTextRecognitionIntent={null} onOpenImageTextRecognition={undefined}
        onCreateDraft={entry => change(entry)} onUpdateDraft={(_, entry) => change(entry)}
        onConfirmPreparedPhrase={commit} onConfirm={() => false} onConfirmDraft={() => null}
        onDiscardResumableRecord={() => false} onRecordCorrection={() => false} onOpenDisplay={() => {}}
      />
      <Button onClick={discard}>取消准备</Button>
      <Button onClick={discard}>丢弃后重新选择</Button>
    </View>}
    <Button onClick={later}>稍后继续</Button>
  </View>
}
