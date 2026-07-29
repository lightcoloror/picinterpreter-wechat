import { useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
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

import CorrectionMemoryManager from '../../../../features/communication/CorrectionMemoryManager'
import ReceiverDisplayPage from '../../../../features/communication/ReceiverDisplayPage'
import NetworkStatusNotice from '../../../../features/communication/NetworkStatusNotice'
import PatientActionButton from '../../../../features/communication/PatientActionButton'
import type {
  MissingTokenOnlineResult,
  MissingTokenReview
} from '../../../../features/communication/MissingTokenQueue'
import ReceiverWorkspace from '../../../../features/communication/ReceiverWorkspace'
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
import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import '../../../../features/communication/CommunicationPage.css'

interface ReceiverDisplayState {
  items: CommunicationOutputItem[]
  recordId: string
  speechText: string
  resumeState: ReceiverWorkspaceResumeState
}

export default function ReceiverPage() {
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
    initialLibraryBoardsRef.current = taroPictureLibraryStore.load()
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
  const attemptedAutomaticMissingTokenIdsRef =
    useRef(new Set<string>())

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
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' })
    )
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

  const discardResumableReceiverRecord = (recordId: string) => {
    try {
      const discarded =
        repositoryRef.current.discardResumableReceiverRecord(recordId)
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
    try {
      const reviewed = repositoryRef.current.reviewMissingToken(recordId, review)
      setMissingTokenItems(repositoryRef.current.loadMissingTokens())
      return Boolean(reviewed)
    } catch (error) {
      return false
    }
  }

  const searchMissingTokensOnline = async (
    recordIds: string[]
  ): Promise<MissingTokenOnlineResult> => {
    const requestedIds = new Set(recordIds)
    const records = repositoryRef.current
      .loadMissingTokens()
      .filter(record => requestedIds.has(record.id) && record.status === 'new')
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
        ])
      )
    })
    let suggestionCount = 0

    records.forEach(record => {
      const suggestions = suggestionsByToken.get(
        record.normalizedToken.trim().toLocaleLowerCase()
      ) || []
      if (!suggestions.length) return

      repositoryRef.current.reviewMissingToken(record.id, {
        status: 'suggested',
        suggestedPictogramId: suggestions[0].id,
        suggestedPictogram: suggestions[0],
        suggestedPictograms: suggestions,
        source: `online:${suggestions[0].source.provider}`
      })
      suggestionCount += suggestions.length
    })

    setMissingTokenItems(repositoryRef.current.loadMissingTokens())
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

      if (
        preferences.onlinePictogramSearchEnabled &&
        taroPictogramSearchPort.configured
      ) {
        const recordIds = next
          .filter(
            record =>
              record.status === 'new' &&
              !attemptedAutomaticMissingTokenIdsRef.current.has(
                record.id
              )
          )
          .map(record => record.id)
          .slice(0, 12)
        recordIds.forEach(recordId =>
          attemptedAutomaticMissingTokenIdsRef.current.add(recordId)
        )
        if (recordIds.length) {
          void searchMissingTokensOnline(recordIds)
        }
      }

      return true
    } catch (error) {
      return false
    }
  }

  const acceptMissingTokenOnline = async (
    recordId: string,
    pictogramId?: string
  ): Promise<MissingTokenOnlineResult> => {
    const record = repositoryRef.current
      .loadMissingTokens()
      .find(item => item.id === recordId)
    const suggestions = getMissingTokenSuggestions(record)
    const selectedPictogram = pictogramId
      ? suggestions.find(pictogram => pictogram.id === pictogramId)
      : suggestions[0]
    if (!record || !selectedPictogram) {
      return { ok: false, message: '候选图已经失效，请重新搜索。' }
    }

    const cached = await taroPictogramSearchPort.cache(
      selectedPictogram
    )
    if (!cached.ok || !cached.value) return cached

    repositoryRef.current.reviewMissingToken(record.id, {
      status: 'resolved',
      resolvedPictogramId: cached.value.id,
      resolvedPictogram: cached.value,
      source: `online:${cached.value.source.provider}`
    })
    setMissingTokenItems(repositoryRef.current.loadMissingTokens())
    return cached
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

  if (receiverDisplay) {
    return (
      <ReceiverDisplayPage
        items={receiverDisplay.items}
        recordId={receiverDisplay.recordId}
        speechText={receiverDisplay.speechText}
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
        imageTextRecognitionIntent={imageTextRecognitionIntent}
        onOpenImageTextRecognition={openImageTextRecognition}
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
        onOpenDisplay={(items, speechText, recordId, resumeState) =>
          setReceiverDisplay({
            items: items.slice(),
            recordId,
            speechText,
            resumeState
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
        缺图搜索只发送单个缺词；确认后的文字和图片序列先保存在本机，账号同步不上传录音。粤语录音识别仅在每次明确同意后临时发送录音，且不写入沟通历史。
      </Text>
    </View>
  )
}
