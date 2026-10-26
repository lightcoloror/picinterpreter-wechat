import { currentImageOperationEpoch } from '@cboard-communication-core/imageOperationEpoch'
import { filterPublicPictureTokens } from '@cboard-communication-core/personalPeople'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'
import { useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import type { CommunicationPreferences } from '@cboard-communication-core/communicationPreferences'
import {
  CONVERSATION_SCENES,
  type ConversationScene
} from '@cboard-communication-core/conversationSession'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type {
  CommunicationHistoryEntry,
  MissingTokenOccurrenceInput,
  MissingTokenRecord
} from '@cboard-communication-core/repository'
import {
  applyPersonalImagePreferencesToBoards,
  type PersonalImagePreference
} from '@cboard-communication-core/personalImagePreferences'
import type {
  ReceiverCorrectionEntry,
  ReceiverDraftEntry
} from '@cboard-communication-core/receiverLifecycle'
import type {
  ReceiverPatientFeedback
} from '@cboard-communication-core/receiverPatientFeedback'
import type { CommunicationOutputItem } from '@cboard-communication-core/symbolMatching'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'
import {
  buildWorkspaceCorrectionMemory,
  disableWorkspaceCorrectionMemoryToken
} from '@cboard-communication-core/correctionMemory'
import {
  getMissingTokenSuggestions,
  normalizeMissingTokenSuggestions
} from '@cboard-communication-core/missingTokens'

import { runtimeCapabilities } from '../../../../config/runtimeCapabilities'
import CorrectionMemoryManager from '../../../../features/communication/CorrectionMemoryManager'
import ReceiverDisplayPage from '../../../../features/communication/ReceiverDisplayPage'
import NetworkStatusNotice from '../../../../features/communication/NetworkStatusNotice'
import PatientActionButton from '../../../../features/communication/PatientActionButton'
import type {
  MissingTokenOnlineResult,
  MissingTokenReview
} from '../../../../features/communication/MissingTokenQueue'
import ReceiverWorkspace from '../../../../features/communication/ReceiverWorkspace'
import SavedPhrasePreparation from '../../../../features/communication/SavedPhrasePreparation'
import { wechatSpeechPort } from '../../../../platform/taroSpeechPort'
import type {
  ImageTextRecognitionIntent
} from '../../../../features/communication/imageTextRecognitionIntent'
import {
  restoreReceiverWorkspaceFromRecord,
  resumeReceiverWorkspaceAfterDisplay,
  type ReceiverDisplayCloseResult,
  type ReceiverWorkspaceResumeState
} from '../../../../features/communication/receiverSession'
import type { CboardAccountSession } from '../../../../platform/cboardAccountPort'
import { createCommunicationCloudSyncService } from '../../../../platform/communicationCloudSync'
import {
  taroCboardAccountPort,
  taroCboardSessionStore
} from '../../../../platform/taroCboardAccountPort'
import { taroCommunicationNavigationIntent } from '../../../../platform/taroCommunicationNavigationIntent'
import { taroImageTextRecognitionIntent } from '../../../../platform/taroImageTextRecognitionIntent'
import { taroCommunicationPreferencesStore } from '../../../../platform/taroCommunicationPreferencesStore'
import { createTaroCommunicationRepository } from '../../../../platform/taroCommunicationRepository'
import { taroPictogramSearchPort } from '../../../../platform/taroPictogramSearchPort'
import type { RuntimePictogram } from '../../../../platform/pictogramSearchPort'
import { loadCommunicationBoards } from '../../../../platform/taroCommunicationBoards'
import '../../../../features/communication/CommunicationPage.css'
import { useCareRefresh } from '../../../../platform/taroCareWorkspace'
import { careScopedKey } from '../../../../platform/taroCareContext'

function getMissingTokenScopeKey() {
  return JSON.stringify([
    taroCboardSessionStore.load()?.user.id || null,
    careScopedKey('missing-token-requests')
  ])
}

interface ReceiverDisplayState {
  items: CommunicationOutputItem[]
  recordId: string
  speechText: string
  resumeState: ReceiverWorkspaceResumeState
  startSegmented?: boolean
  autoPlay?: boolean
}

export default function ReceiverPage() {
  const readError = () => {
    try {
      const repository = createTaroCommunicationRepository()
      repository.loadReceiverRecords()
      repository.loadReceiverCorrections()
      repository.loadSavedPhrasePreparation()
      repository.loadResumableReceiverRecord()
      return ''
    } catch (_) {
      return '本机接收或准备草稿暂时无法读取，原数据已保留；不会用旧内容覆盖。'
    }
  }
  const [error, setError] = useState(readError)
  if (error) return <View className='communication-page'><View className='panel'>
    <Text id='receiver-storage-read-error'>{error}</Text>
    <Button id='receiver-storage-retry-read' onClick={() => setError(readError())}>重试读取草稿</Button>
  </View></View>
  return <ReceiverPageWorkspace />
}

function ReceiverPageWorkspace() {
  const preparationMode = Taro.getCurrentInstance().router?.params.prepare === '1'
  const repositoryRef = useRef(createTaroCommunicationRepository())
  const communicationIdentityRef = useRef<{
    patientId: string
    workspaceId: string
  } | null>(null)
  if (!communicationIdentityRef.current) {
    communicationIdentityRef.current =
      repositoryRef.current.loadCommunicationIdentity()
  }
  const communicationIdentity = communicationIdentityRef.current

  const initialPreferencesRef = useRef<CommunicationPreferences | null>(null)
  if (!initialPreferencesRef.current) {
    initialPreferencesRef.current = taroCommunicationPreferencesStore.load()
  }
  const preferences = initialPreferencesRef.current

  const initialAccountSessionRef = useRef<
    CboardAccountSession | null | undefined
  >(undefined)
  if (initialAccountSessionRef.current === undefined) {
    initialAccountSessionRef.current = taroCboardSessionStore.load()
  }
  const accountSession = initialAccountSessionRef.current

  const initialPersonalImagePreferencesRef = useRef<
    PersonalImagePreference[] | null
  >(null)
  if (!initialPersonalImagePreferencesRef.current) {
    initialPersonalImagePreferencesRef.current =
      repositoryRef.current.loadPersonalImagePreferences()
  }
  const personalImagePreferences = initialPersonalImagePreferencesRef.current
  const initialLibraryBoardsRef = useRef<BoardDTO[] | null>(null)
  if (!initialLibraryBoardsRef.current) {
    initialLibraryBoardsRef.current = loadCommunicationBoards()
  }

  const initialHistoryRef = useRef<CommunicationHistoryEntry[] | null>(null)
  if (!initialHistoryRef.current) {
    initialHistoryRef.current = repositoryRef.current.loadCommunicationHistory()
  }
  const [historyItems, setHistoryItems] = useState(initialHistoryRef.current)

  const initialMissingTokensRef = useRef<MissingTokenRecord[] | null>(null)
  if (!initialMissingTokensRef.current) {
    initialMissingTokensRef.current = repositoryRef.current.loadMissingTokens()
  }
  const [missingTokenItems, setMissingTokenItems] = useState(
    initialMissingTokensRef.current
  )
  // Reuse the Web scope/version guard; per-record tickets also reject older
  // searches and downloads when requests complete out of order.
  const missingTokenRequestsRef = useRef(new Map<string, object>())
  const missingTokenConfirmationsRef = useRef(new Set<string>())
  const preparedMissingImagesRef = useRef(new Map<string, RuntimePictogram>())
  const missingTokenScopeKey = getMissingTokenScopeKey()
  useDidHide(() => missingTokenRequestsRef.current.clear())
  useEffect(() => () => missingTokenRequestsRef.current.clear(), [])

  const initialReceiverCorrectionsRef = useRef<
    ReceiverCorrectionEntry[] | null
  >(null)
  if (!initialReceiverCorrectionsRef.current) {
    initialReceiverCorrectionsRef.current =
      repositoryRef.current.loadReceiverCorrections()
  }
  const [receiverCorrections, setReceiverCorrections] = useState(
    initialReceiverCorrectionsRef.current
  )

  const [conversationSession, setConversationSession] = useState(
    () => repositoryRef.current.getActiveConversationSession()
  )
  const [conversationNotice, setConversationNotice] = useState('')
  const [imageTextRecognitionIntent, setImageTextRecognitionIntent] =
    useState<ImageTextRecognitionIntent | null>(null)
  const cloudSyncServiceRef = useRef(
    createCommunicationCloudSyncService({
      repository: repositoryRef.current,
      settingsPort: taroCboardAccountPort
    })
  )
  const [receiverDisplay, setReceiverDisplay] =
    useState<ReceiverDisplayState | null>(null)
  const [, setCareRevision] = useState(0)
  useCareRefresh(() => {
    missingTokenRequestsRef.current.clear()
    initialPreferencesRef.current = taroCommunicationPreferencesStore.load()
    initialLibraryBoardsRef.current = loadCommunicationBoards()
    initialPersonalImagePreferencesRef.current = repositoryRef.current.loadPersonalImagePreferences()
    setHistoryItems(repositoryRef.current.loadCommunicationHistory())
    setCareRevision(value => value + 1)
  })

  useDidShow(() => {
    const intent = taroImageTextRecognitionIntent.take()
    if (intent) {
      setImageTextRecognitionIntent(intent)
    }
  })

  const personalizedBoards = applyPersonalImagePreferencesToBoards(
    initialLibraryBoardsRef.current,
    personalImagePreferences,
    communicationIdentity
  )
  const visibleBoards = personalizedBoards.filter(
    board => !preferences.hiddenBoardIds.includes(board.id)
  )
  const communicationBoards = visibleBoards.length
    ? visibleBoards
    : personalizedBoards
  const [receiverWorkspaceResumeState, setReceiverWorkspaceResumeState] =
    useState<ReceiverWorkspaceResumeState | null>(() =>
      restoreReceiverWorkspaceFromRecord(
        repositoryRef.current.loadResumableReceiverRecord(),
        communicationBoards
      )
    )
  const correctionMemory = buildWorkspaceCorrectionMemory(
    receiverCorrections,
    {
      workspaceId: communicationIdentity.workspaceId
    }
  )
  const personalImageSignature = personalImagePreferences
    .map(preference =>
      `${preference.boardId}:${preference.tileId}:${preference.updatedAt}`
    )
    .join('|')
  const pageClassName = [
    'communication-page',
    preferences.highContrast ? 'communication-page--high-contrast' : '',
    `communication-page--font-${preferences.fontSize}`,
    `communication-page--grid-${preferences.gridColumns}`
  ].filter(Boolean).join(' ')
  const activeConversationScene = CONVERSATION_SCENES.find(
    scene => scene.id === conversationSession.scene
  )

  const returnToMain = (
    intent?: Parameters<typeof taroCommunicationNavigationIntent.save>[0]
  ) => {
    if (intent) taroCommunicationNavigationIntent.save(intent)
    const patientUrl = '/packages/caregiver/pages/patient/index'
    const pages = Taro.getCurrentPages()
    const previousRoute = pages[pages.length - 2]?.route
    if (previousRoute === patientUrl.slice(1)) {
      void Taro.navigateBack({ delta: 1 }).catch(() =>
        Taro.redirectTo({ url: patientUrl })
      )
    } else {
      // Explicit mode switching must not reapply the account's launch default.
      void Taro.redirectTo({ url: patientUrl })
    }
  }

  const openImageTextRecognition = () => {
    void Taro.navigateTo({
      url: '/packages/ocr/pages/capture/index'
    }).catch(() => {
      setConversationNotice(
        '暂时无法打开图片识字，请继续手工输入。'
      )
    })
  }

  const appendHistory = (entry: CommunicationHistoryEntry) => {
    try {
      repositoryRef.current.appendCommunicationHistory(entry)
      setHistoryItems(repositoryRef.current.loadCommunicationHistory())
      return true
    } catch (error) {
      return false
    }
  }

  const syncReceiverRecords = () => {
    if (!accountSession) return
    void cloudSyncServiceRef.current
      .syncReceiverRecords(accountSession.token)
      .then(result => {
        if (result.value) {
          setHistoryItems(result.value.history)
        }
      })
  }

  const createReceiverDraft = (entry: CommunicationHistoryEntry) => {
    try {
      return repositoryRef.current.createReceiverDraft(entry)
    } catch (error) {
      return null
    }
  }

  const updateReceiverDraft = (
    draft: ReceiverDraftEntry,
    entry: CommunicationHistoryEntry
  ) => {
    try {
      return repositoryRef.current.updateReceiverDraft(draft, entry)
    } catch (error) {
      return null
    }
  }

  const confirmReceiverDraft = (
    draft: ReceiverDraftEntry,
    entry: CommunicationHistoryEntry
  ) => {
    try {
      const confirmed = repositoryRef.current.confirmReceiverDraft(draft, entry)
      setHistoryItems(repositoryRef.current.loadCommunicationHistory())
      syncReceiverRecords()
      return confirmed
    } catch (error) {
      return null
    }
  }

  const discardResumableReceiverRecord = (recordId: string, options?: { expected: ReceiverDraftEntry }) => {
    try {
      const discarded =
        repositoryRef.current.discardResumableReceiverRecord(recordId, options)
      setReceiverWorkspaceResumeState(current =>
        current &&
        current.activeDraft &&
        current.activeDraft.id === recordId
          ? null
          : current
      )
      return discarded
    } catch (error) {
      return false
    }
  }

  const recordReceiverPatientFeedback = (
    recordId: string,
    feedback: ReceiverPatientFeedback
  ) => {
    try {
      const saved =
        repositoryRef.current.recordReceiverPatientFeedback(
          recordId,
          feedback
        )
      if (!saved) return false
      setHistoryItems(repositoryRef.current.loadCommunicationHistory())
      syncReceiverRecords()
      return true
    } catch (error) {
      return false
    }
  }

  const closeReceiverDisplay = (
    result: ReceiverDisplayCloseResult = {}
  ) => {
    if (receiverDisplay) {
      setReceiverWorkspaceResumeState(
        resumeReceiverWorkspaceAfterDisplay(
          receiverDisplay.resumeState,
          result
        )
      )
    }
    setReceiverDisplay(null)
  }

  const recordReceiverCorrection = (entry: ReceiverCorrectionEntry) => {
    try {
      repositoryRef.current.appendReceiverCorrection(entry)
      setReceiverCorrections(
        repositoryRef.current.loadReceiverCorrections()
      )
      return true
    } catch (error) {
      return false
    }
  }

  const forgetCorrectionMemory = (token: string) => {
    const result = disableWorkspaceCorrectionMemoryToken(
      receiverCorrections,
      {
        workspaceId: communicationIdentity.workspaceId,
        token
      }
    )
    if (!result.changed) return false

    try {
      const saved = repositoryRef.current.overwriteReceiverCorrections(
        result.items
      )
      setReceiverCorrections(saved)
      return true
    } catch (error) {
      return false
    }
  }

  const reviewMissingToken = (recordId: string, review: MissingTokenReview) => {
    if (missingTokenScopeKey !== getMissingTokenScopeKey()) return false
    try {
      const reviewed = repositoryRef.current.reviewMissingToken(recordId, review)
      setMissingTokenItems(repositoryRef.current.loadMissingTokens())
      return Boolean(reviewed)
    } catch (error) {
      return false
    }
  }

  const isMissingTokenRequestCurrent = (
    record: MissingTokenRecord, ticket: object, snapshot: string
  ) => {
    if (missingTokenScopeKey !== getMissingTokenScopeKey() ||
        missingTokenRequestsRef.current.get(record.id) !== ticket) return false
    const current = repositoryRef.current.loadMissingTokens().find(item => item.id === record.id)
    // Include the content as well as updatedAt: two user edits can share a millisecond.
    return Boolean(current && JSON.stringify(current) === snapshot)
  }

  const searchMissingTokensOnline = async (
    recordIds: string[]
  ): Promise<MissingTokenOnlineResult> => {
    if (missingTokenScopeKey !== getMissingTokenScopeKey()) {
      return { ok: false, message: '当前档案已切换，请重新打开补图列表。' }
    }
    const requestedIds = new Set(recordIds)
    const records = repositoryRef.current
      .loadMissingTokens()
      .filter(record => requestedIds.has(record.id) && ['new', 'suggested'].includes(record.status) &&
        filterPublicPictureTokens([record.normalizedToken], buildCommunicationTileCatalog(communicationBoards)).length > 0)
    if (!records.length) return { ok: false, message: '没有需要搜索的词。' }
    const ticket = {}
    const snapshots = new Map(records.map(record => [record.id, JSON.stringify(record)]))
    records.forEach(record => missingTokenRequestsRef.current.set(record.id, ticket))
    const result = await taroPictogramSearchPort.search(
      records.map(record => record.normalizedToken)
    )

    if (!result.ok) return result

    const suggestionsByToken = new Map<string, RuntimePictogram[]>()
    const searchResults = result.value || []
    searchResults.forEach(item => {
      const normalizedToken = String(item.token || '')
        .trim()
        .toLocaleLowerCase()
      if (!normalizedToken) return

      suggestionsByToken.set(
        normalizedToken,
        normalizeMissingTokenSuggestions([
          ...(suggestionsByToken.get(normalizedToken) || []),
          item.pictogram
        ], null, normalizedToken)
      )
    })
    let suggestionCount = 0

    records.forEach(record => {
      if (!isMissingTokenRequestCurrent(record, ticket, snapshots.get(record.id)!)) return
      const suggestions = suggestionsByToken.get(
        record.normalizedToken.trim().toLocaleLowerCase()
      ) || []
      if (!suggestions.length) {
        if (record.status === 'suggested') repositoryRef.current.reviewMissingToken(record.id, { status: 'new' })
        return
      }

      repositoryRef.current.reviewMissingToken(record.id, {
        status: 'suggested',
        suggestedPictogramId: suggestions[0].id,
        suggestedPictogram: suggestions[0],
        suggestedPictograms: suggestions,
        source: `online:${suggestions[0].source.provider}`
      })
      suggestionCount += suggestions.length
    })

    if (missingTokenScopeKey === getMissingTokenScopeKey() &&
        records.some(record => missingTokenRequestsRef.current.get(record.id) === ticket)) {
      setMissingTokenItems(repositoryRef.current.loadMissingTokens())
    }
    return {
      ok: true,
      message: suggestionCount
        ? `已找到 ${suggestionCount} 张候选图，请照护者确认。`
        : result.message
    }
  }

  const recordMissingTokens = (entry: MissingTokenOccurrenceInput) => {
    try {
      const next = repositoryRef.current.recordMissingTokens(entry)
      setMissingTokenItems(next)

      // Recording or restoring a gap is local work. The existing search button
      // is the explicit network boundary, including when online search is enabled.
      return true
    } catch (error) {
      return false
    }
  }

  const acceptMissingTokenOnline = async (
    recordId: string,
    pictogramId?: string
  ): Promise<MissingTokenOnlineResult> => {
    if (missingTokenScopeKey !== getMissingTokenScopeKey()) {
      return { ok: false, message: '当前档案已切换，请重新打开补图列表。' }
    }
    const record = repositoryRef.current
      .loadMissingTokens()
      .find(item => item.id === recordId)
    const suggestions = getMissingTokenSuggestions(record)
    const selectedPictogram = pictogramId
      ? suggestions.find(pictogram => pictogram.id === pictogramId)
      : suggestions[0]
    if (!record || record.status !== 'suggested' || !selectedPictogram) {
      return { ok: false, message: '候选图已经失效，请重新搜索。' }
    }

    const confirmationKey = JSON.stringify([missingTokenScopeKey, record.id])
    if (missingTokenConfirmationsRef.current.has(confirmationKey)) {
      return { ok: false, message: '图片正在保存，请稍候。' }
    }
    // A synchronous guard also covers repeated clicks before React rerenders.
    const epoch = currentImageOperationEpoch()
    const preparedKey = JSON.stringify([confirmationKey, record, selectedPictogram.id, epoch])
    missingTokenConfirmationsRef.current.add(confirmationKey)
    let cachedPictogram: RuntimePictogram | undefined
    // A failed receipt does not prove that the image is unreferenced. Retain
    // prepared bytes for this operation; never delete an existing snapshot.
    const discardUncommittedImage = async (failure: MissingTokenOnlineResult) => failure


    try {
      const ticket = {}
      const snapshot = JSON.stringify(record)
      missingTokenRequestsRef.current.set(record.id, ticket)
      const prepared = preparedMissingImagesRef.current.get(preparedKey)
      const cached = prepared ? { ok: true, value: prepared, message: '已复用本次核验图片。' }
        : await taroPictogramSearchPort.cache(selectedPictogram)
      if (!cached.ok || !cached.value) return cached
      cachedPictogram = cached.value
      if (epoch !== currentImageOperationEpoch()) return { ok: false, message: '操作范围已变化，图片未采用。' }
      preparedMissingImagesRef.current.set(preparedKey, cached.value)
      if (!isMissingTokenRequestCurrent(record, ticket, snapshot)) {
        return await discardUncommittedImage({ ok: false, message: '记录或候选图已更新，请重新确认。' })
      }

      const reviewed = repositoryRef.current.reviewMissingToken(record.id, {
        status: 'resolved',
        resolvedPictogramId: cached.value.id,
        resolvedPictogram: cached.value,
        source: `online:${cached.value.source.provider}`
      })
      if (!reviewed || reviewed.status !== 'resolved' ||
          reviewed.resolvedPictogram?.image !== cached.value.image) {
        return await discardUncommittedImage({ ok: false, message: '词图关联保存失败，请保留候选并重试。' })
      }
      preparedMissingImagesRef.current.delete(preparedKey)
      setMissingTokenItems(repositoryRef.current.loadMissingTokens())
      return cached
    } catch (error) {
      return await discardUncommittedImage({
        ok: false,
        message: cachedPictogram
          ? '词图关联保存失败，请保留候选并重试。'
          : '图片下载或保存失败，请保留候选并重试。'
      })
    } finally {
      missingTokenConfirmationsRef.current.delete(confirmationKey)
    }
  }

  const selectConversationScene = (scene: ConversationScene) => {
    const nextScene =
      conversationSession.scene === scene ? null : scene
    const nextSession =
      repositoryRef.current.setConversationScene(nextScene)
    if (!nextSession) {
      setConversationNotice('场景暂时无法保存，请检查设备存储后重试。')
      return
    }

    setConversationSession(nextSession)
    const selected = CONVERSATION_SCENES.find(
      item => item.id === nextSession.scene
    )
    setConversationNotice(
      selected ? `当前场景：${selected.label}` : '已清除当前场景。'
    )
  }

  const startNewConversation = async () => {
    const confirmation = await Taro.showModal({
      title: '开始新对话',
      content: '当前 AI 上下文和场景将被清除，原有历史仍会保留。',
      confirmText: '确认开始',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    try {
      const nextSession =
        repositoryRef.current.resetConversationSession()
      setConversationSession(nextSession)
      setReceiverWorkspaceResumeState(null)
      setConversationNotice('新对话已开始，原有历史仍会保留。')
    } catch (error) {
      setConversationNotice('暂时无法开始新对话，请稍后重试。')
    }
  }

  const openEmergencyPage = () => {
    void Taro.navigateTo({
      url: '/packages/emergency/pages/index/index'
    }).catch(() => {
      setConversationNotice('暂时无法打开紧急求助，请重试。')
    })
  }

  if (preparationMode) {
    return <View className={pageClassName}>
      <NetworkStatusNotice />
      <SavedPhrasePreparation key={missingTokenScopeKey}
        initialRequest={Taro.getCurrentInstance().router?.params.phraseId ? { id: decodeURIComponent(Taro.getCurrentInstance().router?.params.phraseId || ''), mode: Taro.getCurrentInstance().router?.params.phraseMode === 'copy' ? 'copy' : 'edit' } : undefined}
        repository={repositoryRef.current} getScopeKey={getMissingTokenScopeKey}
        onInvalidate={() => { missingTokenRequestsRef.current.clear(); wechatSpeechPort.stop() }}
        onClose={() => { void Taro.navigateBack() }}
        onSaved={(item, cleanupPending) => {
          Taro.getCurrentInstance().page?.getOpenerEventChannel?.().emit('prepared', { item, cleanupPending })
          void Taro.navigateBack()
        }}
        receiverProps={{ boards: communicationBoards, onConfirm: () => false,
          onCreateDraft: () => null, onUpdateDraft: () => null, onConfirmDraft: () => null,
          onDiscardResumableRecord: () => false, onRecordCorrection: () => false,
          onRecordMissingTokens: recordMissingTokens, missingTokenRecords: missingTokenItems,
          correctionMemory, onlineSearchEnabled: true,
          onlineSearchAvailable: taroPictogramSearchPort.configured,
          onReviewMissingToken: reviewMissingToken, onSearchMissingTokensOnline: searchMissingTokensOnline,
          onAcceptMissingTokenOnline: acceptMissingTokenOnline, onOpenDisplay: () => {} }}
      />
    </View>
  }
  if (receiverDisplay) {
    return (
      <ReceiverDisplayPage
        items={receiverDisplay.items}
        recordId={receiverDisplay.recordId}
        speechText={receiverDisplay.speechText}
        sequence={receiverDisplay.resumeState.activeDraft?.pictogramSequence}
        startSegmented={receiverDisplay.startSegmented}
        autoPlay={receiverDisplay.autoPlay}
        speechRate={preferences.speechRate}
        highContrast={preferences.highContrast}
        onFeedback={recordReceiverPatientFeedback}
        onClose={closeReceiverDisplay}
      />
    )
  }

  return (
    <View className={pageClassName}>
      <View className='mode-switch' role='tablist'>
        <PatientActionButton
          action={PATIENT_ACTION_IDS.express}
          id='express-mode-button'
          className='mode-switch__button'
          onClick={() => returnToMain()}
          label='患者表达'
          ariaLabel='返回患者表达'
        />
        <PatientActionButton
          action={PATIENT_ACTION_IDS.receive}
          id='receiver-mode-button'
          className='mode-switch__button mode-switch__button--active'
          label='接收理解'
          ariaLabel='当前为接收理解'
        />
      </View>

      <View className='primary-access-actions'>
        <PatientActionButton
          action={PATIENT_ACTION_IDS.emergency}
          id='emergency-page-button'
          className='primary-access-action primary-access-action--emergency'
          onClick={openEmergencyPage}
          label='紧急求助'
          ariaLabel='打开紧急求助'
        />
        <Button
          id='caregiver-tools-toggle'
          className='primary-access-action primary-access-action--caregiver'
          onClick={() => returnToMain({ showCaregiverTools: true })}
        >
          照护工具
        </Button>
      </View>

      <NetworkStatusNotice />

      <View className='receiver-context'>
        <View className='receiver-context__header'>
          <View>
            <Text className='receiver-context__title'>当前沟通场景</Text>
            <Text className='receiver-context__hint'>
              仅用于优化后续 AI 候选句，不使用定位权限。
            </Text>
          </View>
          <Button
            id='receiver-new-conversation'
            className='receiver-context__reset'
            onClick={() => {
              void startNewConversation()
            }}
          >
            新对话
          </Button>
        </View>
        <View className='receiver-context__scenes'>
          {CONVERSATION_SCENES.map(scene => {
            const selected = conversationSession.scene === scene.id
            return (
              <Button
                key={scene.id}
                id={`conversation-scene-${scene.id}`}
                className={[
                  'receiver-context__scene',
                  selected ? 'receiver-context__scene--active' : ''
                ].filter(Boolean).join(' ')}
                onClick={() => selectConversationScene(scene.id)}
              >
                {scene.icon} {scene.label}
              </Button>
            )
          })}
        </View>
        <Text className='receiver-context__status'>
          当前场景：
          {activeConversationScene
            ? activeConversationScene.label
            : '未选择'}
        </Text>
        {conversationNotice && (
          <Text className='receiver-context__notice'>
            {conversationNotice}
          </Text>
        )}
      </View>

      <ReceiverWorkspace
        key={`receive-${conversationSession.id}-${preferences.hiddenBoardIds.join('-')}-${personalImageSignature}`}
        boards={communicationBoards}
        initialState={receiverWorkspaceResumeState}
        receiverRecords={repositoryRef.current.loadReceiverRecords()}
        imageTextRecognitionIntent={imageTextRecognitionIntent}
        onOpenImageTextRecognition={
          runtimeCapabilities.ocr
            ? openImageTextRecognition
            : undefined
        }
        onConfirm={appendHistory}
        onCreateDraft={createReceiverDraft}
        onUpdateDraft={updateReceiverDraft}
        onConfirmDraft={confirmReceiverDraft}
        onDiscardResumableRecord={discardResumableReceiverRecord}
        onRecordCorrection={recordReceiverCorrection}
        onRecordMissingTokens={recordMissingTokens}
        missingTokenRecords={missingTokenItems}
        correctionMemory={correctionMemory}
        onlineSearchEnabled={preferences.onlinePictogramSearchEnabled}
        onlineSearchAvailable={taroPictogramSearchPort.configured}
        onReviewMissingToken={reviewMissingToken}
        onSearchMissingTokensOnline={searchMissingTokensOnline}
        onAcceptMissingTokenOnline={acceptMissingTokenOnline}
        onOpenDisplay={(items, speechText, recordId, resumeState, options) =>
          setReceiverDisplay({
            items: items.slice(),
            recordId,
            speechText,
            resumeState,
            ...options
          })
        }
      />

      <CorrectionMemoryManager
        boards={communicationBoards}
        memory={correctionMemory}
        onForget={forgetCorrectionMemory}
      />

      <View className='history-summary'>
        <Text className='history-summary__title'>最近沟通</Text>
        <Text className='history-summary__count'>
          当前设备共保存 {historyItems.length} 条，返回患者侧后可进入“全部历史”管理。
        </Text>
      </View>

      <Text className='boundary-note'>
        {process.env.TARO_APP_CARE_COLLABORATION === 'true'
          ? '普通沟通历史仅在本机保留最近 50 条；收藏独立保存，可按权限同步。缺图搜索只发送单个缺词；粤语录音识别仅在每次明确同意后临时发送录音，录音不随档案同步。'
          : '缺图搜索只发送单个缺词；确认后的文字和图片序列先保存在本机，账号同步不上传录音。粤语录音识别仅在每次明确同意后临时发送录音，且不写入沟通历史。'}
      </Text>
    </View>
  )
}
