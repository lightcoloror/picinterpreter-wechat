import { clearSavedPhraseUndoSession } from '@cboard-communication-core/savedPhraseUse'
import { useReducer, useRef, useState } from 'react'
import { isCareSharedPhrase } from '@cboard-communication-core/careSharedPhrases'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  projectVisibleCommunicationBoards,
  type CommunicationPreferences
} from '@cboard-communication-core/communicationPreferences'
import {
  findExpressionCandidateFeedbackDraft,
  type ExpressionCandidate,
  type ExpressionCandidateFeedbackDraft
} from '@cboard-communication-core/candidateFeedback'
import type {
  ConversationSession
} from '@cboard-communication-core/conversationSession'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type { ExpressionSavedPhraseEntry } from '@cboard-communication-core/expressionPipeline'
import {
  createExpressionDraftService,
  hasResumableExpressionDraft,
  type ExpressionDraftRecord,
  type ExpressionDraftService
} from '@cboard-communication-core/expressionDraft'
import type {
  CommunicationHistoryEntry,
  CommunicationSavedPhraseEntry
} from '@cboard-communication-core/repository'
import {
  addCommunicationSavedPhrase,
  markCommunicationSavedPhraseUsed
} from '@cboard-communication-core/savedPhraseManagement'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'
import {
  applyPersonalImagePreferencesToBoards,
  type PersonalImagePreference
} from '@cboard-communication-core/personalImagePreferences'
import type {
  PictogramOrderingState
} from '@cboard-communication-core/pictogramOrdering'
import type { CboardAccountSession } from '../../platform/cboardAccountPort'
import { canEditCareLibrary, careScopedKey } from '../../platform/taroCareContext'
import { useCareRefresh, loadCareSharedPhrases } from '../../platform/taroCareWorkspace'
import { taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import { taroCommunicationNavigationIntent } from '../../platform/taroCommunicationNavigationIntent'
import { taroCommunicationPreferencesStore } from '../../platform/taroCommunicationPreferencesStore'
import { taroPictogramOrderingStore } from '../../platform/taroPictogramOrderingStore'
import { createTaroCommunicationRepository } from '../../platform/taroCommunicationRepository'
import { loadCommunicationBoards } from '../../platform/taroCommunicationBoards'
import CommunicationOnboarding from './CommunicationOnboarding'
import ExpressionWorkspace from './ExpressionWorkspace'
import NetworkStatusNotice from './NetworkStatusNotice'
import PatientActionButton from './PatientActionButton'
import {
  createExpressionSession,
  createExpressionSessionFromDraft,
  createExpressionSessionFromSavedPhrase,
  expressionSessionReducer,
  type ExpressionSessionState
} from './session'
import './CommunicationPage.css'

function createPersonalImageSignature(
  preferences: PersonalImagePreference[]
) {
  return preferences
    .map(
      preference =>
        `${preference.boardId}:${preference.tileId}:${preference.updatedAt}`
    )
    .join('|')
}

const readExpressionStorageError = () => {
  try {
    const repository = createTaroCommunicationRepository()
    repository.loadCommunicationIdentity()
    repository.loadCommunicationHistory()
    repository.loadExpressionDraft()
    return ''
  } catch (_) {
    return '本机表达草稿暂时无法读取。原数据已保留，请重试；不会改用旧草稿。'
  }
}

export default function CommunicationPage() {
  // A corrupt/unreadable authoritative file must not open an empty writer or
  // fall back to an older settings-cache draft. Retry the same storage path.
  const [storageError, setStorageError] = useState(readExpressionStorageError)
  if (storageError) return <View className='communication-page'>
    <View className='panel'>
      <Text id='expression-storage-read-error'>{storageError}</Text>
      <Button id='expression-storage-retry-read' onClick={() => setStorageError(readExpressionStorageError())}>重试读取草稿</Button>
    </View>
  </View>
  return <CommunicationPageWorkspace />
}

function CommunicationPageWorkspace() {
  const repositoryRef = useRef(createTaroCommunicationRepository())
  const expressionScopeRef = useRef(careScopedKey('expression'))
  const draftServiceRef = useRef<ExpressionDraftService | null>(null)
  const initialDraftRef = useRef<{
    record: ExpressionDraftRecord | null
    error: string
  } | null>(null)
  if (!draftServiceRef.current) {
    draftServiceRef.current = createExpressionDraftService({
      repository: repositoryRef.current,
      getScopeKey: () => careScopedKey('expression')
    })
    try {
      initialDraftRef.current = { record: draftServiceRef.current.load(), error: '' }
    } catch (error) {
      initialDraftRef.current = {
        record: null, error: error instanceof Error ? error.message : '草稿暂时无法读取，原数据已保留。'
      }
    }
  }
  const [pendingDraft, setPendingDraft] = useState(
    hasResumableExpressionDraft(initialDraftRef.current!.record)
      ? initialDraftRef.current!.record : null
  )
  const [draftReadError, setDraftReadError] = useState(initialDraftRef.current!.error)
  const [draftDeferred, setDraftDeferred] = useState(false)
  const [restoredDraft, setRestoredDraft] = useState<ExpressionDraftRecord | null>(null)
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  const communicationIdentityRef = useRef<{
    patientId: string
    workspaceId: string
  } | null>(null)
  if (!communicationIdentityRef.current) {
    communicationIdentityRef.current =
      repositoryRef.current.loadCommunicationIdentity()
  }
  const communicationIdentity = communicationIdentityRef.current
  const initialLibraryBoardsRef = useRef<BoardDTO[] | null>(null)
  if (!initialLibraryBoardsRef.current) {
    initialLibraryBoardsRef.current = loadCommunicationBoards()
  }
  const libraryVersionRef = useRef(
    JSON.stringify(initialLibraryBoardsRef.current)
  )
  const initialPersonalImagePreferencesRef = useRef<
    PersonalImagePreference[] | null
  >(null)
  if (!initialPersonalImagePreferencesRef.current) {
    initialPersonalImagePreferencesRef.current =
      repositoryRef.current.loadPersonalImagePreferences()
  }
  const initialPreferencesRef = useRef<CommunicationPreferences | null>(null)
  if (!initialPreferencesRef.current) {
    initialPreferencesRef.current = taroCommunicationPreferencesStore.load()
  }
  const initialPictogramOrderingRef =
    useRef<PictogramOrderingState | null>(null)
  if (!initialPictogramOrderingRef.current) {
    initialPictogramOrderingRef.current = taroPictogramOrderingStore.load()
  }
  const initialAccountSessionRef = useRef<
    CboardAccountSession | null | undefined
  >(undefined)
  if (initialAccountSessionRef.current === undefined) {
    initialAccountSessionRef.current = taroCboardSessionStore.load()
  }
  const initialConversationSessionRef = useRef<ConversationSession | null>(null)
  if (!initialConversationSessionRef.current) {
    initialConversationSessionRef.current =
      repositoryRef.current.getActiveConversationSession()
  }

  const initialHistoryRef = useRef<CommunicationHistoryEntry[] | null>(null)
  if (!initialHistoryRef.current) {
    initialHistoryRef.current = repositoryRef.current.loadCommunicationHistory()
  }

  const initialSavedPhrasesRef = useRef<
    CommunicationSavedPhraseEntry[] | null
  >(null)
  if (!initialSavedPhrasesRef.current) {
    initialSavedPhrasesRef.current =
      repositoryRef.current.loadCommunicationSavedPhrases()
  }

  const initialSessionRef = useRef<ExpressionSessionState | null>(null)
  if (!initialSessionRef.current) {
    // Confirmed history is not unfinished work. Draft/cleared/confirmed markers
    // all take precedence, and nothing is restored before the user's choice.
    initialSessionRef.current = createExpressionSession()
  }

  const [expressionSession, expressionDispatch] = useReducer(
    expressionSessionReducer,
    initialSessionRef.current
  )
  const expressionSessionRef = useRef(expressionSession)
  expressionSessionRef.current = expressionSession
  const [showCaregiverTools, setShowCaregiverTools] = useState(false)
  const [canEditLibrary, setCanEditLibrary] = useState(canEditCareLibrary)
  const [showOnboarding, setShowOnboarding] = useState(
    !initialPreferencesRef.current.onboardingComplete
  )
  const [preferences, setPreferences] = useState(initialPreferencesRef.current)
  const [pictogramOrdering, setPictogramOrdering] = useState(
    initialPictogramOrderingRef.current
  )
  const [accountSession, setAccountSession] = useState(
    initialAccountSessionRef.current
  )
  const [conversationSession, setConversationSession] = useState(
    initialConversationSessionRef.current
  )
  const [conversationNotice, setConversationNotice] = useState('')
  const [historyItems, setHistoryItems] = useState(initialHistoryRef.current)
  const [savedPhraseItems, setSavedPhraseItems] = useState(
    initialSavedPhrasesRef.current
  )
  const [sharedPhraseItems, setSharedPhraseItems] = useState<CommunicationSavedPhraseEntry[]>(() => loadCareSharedPhrases())
  const [personalImagePreferences, setPersonalImagePreferences] = useState(
    initialPersonalImagePreferencesRef.current
  )
  const personalImageSignatureRef = useRef(
    createPersonalImageSignature(
      initialPersonalImagePreferencesRef.current
    )
  )
  const [libraryBoards, setLibraryBoards] = useState(
    initialLibraryBoardsRef.current
  )
  const personalizedBoards = applyPersonalImagePreferencesToBoards(
    libraryBoards,
    personalImagePreferences,
    communicationIdentity
  )
  const visibleBoards = projectVisibleCommunicationBoards(
    personalizedBoards,
    preferences.hiddenBoardIds
  )
  const communicationBoards = visibleBoards.length
    ? visibleBoards
    : personalizedBoards
  const pageClassName = [
    'communication-page',
    preferences.highContrast ? 'communication-page--high-contrast' : '',
    `communication-page--font-${preferences.fontSize}`,
    `communication-page--grid-${preferences.gridColumns}`
  ].filter(Boolean).join(' ')

  const markPhraseUsed = (entry: CommunicationSavedPhraseEntry) => {
    if (isCareSharedPhrase(entry)) return
    if (!entry.id) return
    const result = markCommunicationSavedPhraseUsed(
      repositoryRef.current.loadCommunicationSavedPhrases(),
      entry.id
    )
    if (result.changed) {
      repositoryRef.current.overwriteCommunicationSavedPhrases(
        result.items
      )
    }
    setSavedPhraseItems(
      repositoryRef.current.loadCommunicationSavedPhrases()
    )
  }

  const loadedPhraseRef = useRef('')
  const reusePhrase = (
    entry: CommunicationSavedPhraseEntry,
    boards: BoardDTO[] = personalizedBoards
  ) => {
    // A management navigation must not silently replace the deferred draft.
    if (pendingDraft || draftReadError) {
      setConversationNotice('请先选择继续上次表达，或明确开始新表达，再载入常用语。')
      return false
    }
    const nextSession = createExpressionSessionFromSavedPhrase(
      boards,
      entry
    )
    if (!nextSession.pipeline.candidateSentences.length) return false

    const key = JSON.stringify([entry.id, entry.sentence, entry.output])
    const current = expressionSessionRef.current
    const startsNewExpression = draftServiceRef.current!.getCurrent()?.status === 'confirmed'
    if (!startsNewExpression && loadedPhraseRef.current === key &&
        current.pipeline.candidateSentences[0] === entry.sentence &&
        JSON.stringify(current.selectedTiles) === JSON.stringify(nextSession.selectedTiles)) return true
    if (startsNewExpression) {
      try {
        // Both management and quick reuse must finish the old confirmation.
        // Persist the new reviewed snapshot before changing the visible session.
        draftServiceRef.current!.save({
          pipeline: nextSession.pipeline,
          rejected: false,
          candidateFeedbackEntries: [],
          pendingAi: null
        }, { startNew: true })
      } catch (error) {
        setConversationNotice('新表达暂时未能保存到本机，原内容已保留，请重试载入。')
        return false
      }
    }
    try {
      markPhraseUsed(entry)
    } catch (error) {
      // Usage is ancillary: its failure must not leave the UI on the completed
      // expression after a new draft has already been reliably saved.
      setConversationNotice('常用语已载入，使用次数暂时未能更新。')
    }
    loadedPhraseRef.current = key
    expressionSessionRef.current = nextSession
    expressionDispatch({ type: 'replace-session', state: nextSession })
    if (startsNewExpression) {
      setRestoredDraft(null)
      setWorkspaceRevision(value => value + 1)
    }
    return true
  }

  const openEmergencyPage = () => {
    void Taro.navigateTo({
      url: '/packages/emergency/pages/index/index'
    }).catch(() => {
      setConversationNotice('暂时无法打开紧急求助，请重试。')
    })
  }

  const openManagementPage = (
    view: 'phrases' | 'history' | 'settings' | 'diagnostics'
  ) => {
    // navigateTo keeps this workspace alive. Its ordered snapshot and candidate
    // state must not be replaced by an ID-only navigation intent on return.
    void Taro.navigateTo({
      url: `/packages/management/pages/index/index?view=${view}`
    }).catch(() => {
      setConversationNotice('暂时无法打开照护工具，请重试。')
    })
  }

  const refreshCareWorkspace = () => {
    const nextScope = careScopedKey('expression')
    const scopeChanged = nextScope !== expressionScopeRef.current
    if (!scopeChanged && draftServiceRef.current!.getCurrent()) {
      try {
        if (!repositoryRef.current.loadExpressionDraft()) {
          // The explicit private-data purge removes drafts. Drop the suspended
          // in-memory workspace too, rather than resurrecting cleared photos.
          draftServiceRef.current = createExpressionDraftService({
            repository: repositoryRef.current,
            getScopeKey: () => careScopedKey('expression')
          })
          draftServiceRef.current.load()
          expressionSessionRef.current = createExpressionSession()
          expressionDispatch({ type: 'reset' })
          setPendingDraft(null)
          setRestoredDraft(null)
          setDraftReadError('')
          setWorkspaceRevision(value => value + 1)
        }
      } catch (error) {
        setConversationNotice('草稿读取暂时失败，当前表达仍保留；请重试保存。')
      }
    }
    if (scopeChanged) {
      clearSavedPhraseUndoSession()
      loadedPhraseRef.current = ''
      expressionScopeRef.current = nextScope
      expressionSessionRef.current = createExpressionSession()
      expressionDispatch({ type: 'reset' })
      communicationIdentityRef.current = repositoryRef.current.loadCommunicationIdentity()
      draftServiceRef.current = createExpressionDraftService({
        repository: repositoryRef.current,
        getScopeKey: () => careScopedKey('expression')
      })
      setRestoredDraft(null)
      setDraftDeferred(false)
      setWorkspaceRevision(value => value + 1)
      try {
        const record = draftServiceRef.current.load()
        setPendingDraft(hasResumableExpressionDraft(record) ? record : null)
        setDraftReadError('')
      } catch (error) {
        setPendingDraft(null)
        setDraftReadError(error instanceof Error ? error.message : '草稿暂时无法读取，原数据已保留。')
      }
    }
    const nextIdentity = communicationIdentityRef.current!
    setCanEditLibrary(canEditCareLibrary())
    const nextConversation =
      repositoryRef.current.getActiveConversationSession()
    // Expiring AI conversation context must not erase human work.
    setConversationSession(nextConversation)
    setHistoryItems(repositoryRef.current.loadCommunicationHistory())
    const nextSavedPhrases =
      repositoryRef.current.loadCommunicationSavedPhrases()
    setSavedPhraseItems(nextSavedPhrases)
    setSharedPhraseItems(loadCareSharedPhrases())
    const nextPersonalImagePreferences =
      repositoryRef.current.loadPersonalImagePreferences()
    const nextLibraryBoards = loadCommunicationBoards()
    const nextPersonalizedBoards = applyPersonalImagePreferencesToBoards(
      nextLibraryBoards,
      nextPersonalImagePreferences,
      nextIdentity
    )
    const nextPersonalImageSignature = createPersonalImageSignature(
      nextPersonalImagePreferences
    )
    personalImageSignatureRef.current =
      nextPersonalImageSignature
    setPersonalImagePreferences(nextPersonalImagePreferences)
    setLibraryBoards(nextLibraryBoards)
    const nextLibraryVersion = JSON.stringify(nextLibraryBoards)
    if (nextLibraryVersion !== libraryVersionRef.current) {
      libraryVersionRef.current = nextLibraryVersion
    }
    const nextPreferences = taroCommunicationPreferencesStore.load()
    setPreferences(nextPreferences)
    if (!nextPreferences.onboardingComplete) {
      setShowOnboarding(true)
    }
    setPictogramOrdering(taroPictogramOrderingStore.load())
    setAccountSession(taroCboardSessionStore.load())

    const navigationIntent = taroCommunicationNavigationIntent.take()
    const navigationUtilityView =
      navigationIntent && navigationIntent.utilityView
    if (navigationUtilityView === 'emergency') {
      openEmergencyPage()
    } else if (navigationUtilityView) {
      openManagementPage(navigationUtilityView)
    }
    if (navigationIntent && navigationIntent.reuseSavedPhraseId) {
      const savedPhrase = nextSavedPhrases.find(
        entry => entry.id === navigationIntent.reuseSavedPhraseId
      )
      if (!savedPhrase || !reusePhrase(savedPhrase, nextPersonalizedBoards)) {
        setConversationNotice('这条常用语暂时无法恢复，请重新选择。')
      }
    }
    if (navigationIntent && navigationIntent.showCaregiverTools) {
      setShowCaregiverTools(true)
    }
  }
  useDidShow(refreshCareWorkspace)
  useCareRefresh(refreshCareWorkspace)

  const appendHistory = (entry: CommunicationHistoryEntry) => {
    try {
      const confirmedId = draftServiceRef.current!.getCurrent()?.confirmedRecordId
      // The existing thumbs-feedback operation may update feedback on a
      // confirmed record, but cannot use this path to replace its expression.
      if (entry.id && entry.id === confirmedId) {
        const previous = repositoryRef.current.loadCommunicationHistory()
          .find(item => item.id === confirmedId)
        if (!previous || previous.sentence !== entry.sentence ||
            JSON.stringify(previous.output) !== JSON.stringify(entry.output)) return null
        const persisted = repositoryRef.current.appendCommunicationHistory({
          ...previous, candidates: entry.candidates
        })
        setHistoryItems(repositoryRef.current.loadCommunicationHistory())
        return persisted
      }
      const persisted = draftServiceRef.current!.confirm(entry)
      setHistoryItems(repositoryRef.current.loadCommunicationHistory())
      return persisted
    } catch (error) {
      return null
    }
  }

  const saveCandidateFeedbackDraft = (entry: {
    id?: string
    outputSignature: string
    candidates: ExpressionCandidate[]
    rejected?: boolean
  }): ExpressionCandidateFeedbackDraft | null => {
    try {
      return repositoryRef.current.saveExpressionCandidateFeedbackDraft(
        entry
      )
    } catch (error) {
      return null
    }
  }

  const discardCandidateFeedbackDraft = (id: string) => {
    try {
      return repositoryRef.current.removeExpressionCandidateFeedbackDraft(
        id
      )
    } catch (error) {
      return false
    }
  }

  const savePhrase = (entry: ExpressionSavedPhraseEntry) => {
    // The workspace presents the repository's precise capacity/persistence
    // failure and keeps the expression available for an explicit retry.
    const repository = repositoryRef.current
    const current = repository.loadCommunicationSavedPhrases()
    const result = addCommunicationSavedPhrase(current, { ...entry })
    if (!result.item) throw new Error('这句话没有可收藏的内容。')
    if (result.changed) repository.overwriteCommunicationSavedPhrases(result.items, { expectedPhrases: current })
    setSavedPhraseItems(
      repositoryRef.current.loadCommunicationSavedPhrases()
    )
    return true
  }

  const updatePreferences = (value: CommunicationPreferences) => {
    setPreferences(taroCommunicationPreferencesStore.save(value))
  }

  const recordPictogramUse = (boardId: string, tileId: string) => {
    setPictogramOrdering(
      taroPictogramOrderingStore.recordUsage(boardId, tileId)
    )
  }

  const completeOnboarding = () => {
    updatePreferences({ ...preferences, onboardingComplete: true })
    setShowOnboarding(false)
  }

  const retryDraftRead = () => {
    try {
      const record = draftServiceRef.current!.load()
      setPendingDraft(hasResumableExpressionDraft(record) ? record : null)
      setDraftReadError('')
      setDraftDeferred(false)
    } catch (error) {
      setDraftReadError(error instanceof Error ? error.message : '草稿读取失败，请重试。')
    }
  }

  const continueDraft = () => {
    if (!pendingDraft) return
    const nextSession = createExpressionSessionFromDraft(pendingDraft.snapshot)
    expressionSessionRef.current = nextSession
    expressionDispatch({ type: 'replace-session', state: nextSession })
    setRestoredDraft(pendingDraft)
    setPendingDraft(null)
    setDraftDeferred(false)
    setWorkspaceRevision(value => value + 1)
  }

  const discardPendingDraft = async () => {
    const scope = expressionScopeRef.current
    const confirmation = await Taro.showModal({
      title: '开始新表达',
      content: '将丢弃这份未完成表达。图库、收藏和历史保留；丢弃不代表取消已发出的 AI 请求或退款。',
      confirmText: '丢弃并开始',
      cancelText: '保留草稿'
    })
    if (!confirmation.confirm || scope !== careScopedKey('expression')) return
    try {
      draftServiceRef.current!.discard()
      setPendingDraft(null)
      setRestoredDraft(null)
      setDraftDeferred(false)
      expressionSessionRef.current = createExpressionSession()
      expressionDispatch({ type: 'reset' })
      setWorkspaceRevision(value => value + 1)
    } catch (error) {
      setDraftReadError(error instanceof Error ? error.message : '草稿未能清除，请重试。')
    }
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
      const nextSession = repositoryRef.current.resetConversationSession()
      setConversationSession(nextSession)
      setConversationNotice('新对话已开始，原有历史仍会保留。')
      // New dialogue only expires model context; unfinished expression remains.
    } catch (error) {
      setConversationNotice('暂时无法开始新对话，请稍后重试。')
    }
  }

  if (showOnboarding) {
    return <CommunicationOnboarding onComplete={completeOnboarding} />
  }

  return (
    <View className={pageClassName}>
      <View className='mode-switch' role='tablist'>
        <PatientActionButton
          action={PATIENT_ACTION_IDS.express}
          id='express-mode-button'
          className='mode-switch__button mode-switch__button--active'
          onClick={() => setShowCaregiverTools(false)}
          label='患者表达'
          ariaLabel='打开患者表达'
        />
        <PatientActionButton
          action={PATIENT_ACTION_IDS.receive}
          id='receiver-mode-button'
          className='mode-switch__button'
          onClick={() => {
            setShowCaregiverTools(false)
            void Taro.navigateTo({
              url: '/packages/caregiver/pages/receiver/index'
            }).catch(() => {
              setConversationNotice('暂时无法打开接收端，请重试。')
            })
          }}
          label='接收理解'
          ariaLabel='打开接收理解'
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
          onClick={() => setShowCaregiverTools(current => !current)}
        >
          {showCaregiverTools ? '收起照护工具' : '照护工具'}
        </Button>
      </View>

      {showCaregiverTools && (
        <View id='caregiver-tools-panel' className='caregiver-tools-panel'>
          <NetworkStatusNotice />
          <View className='conversation-session'>
            <View className='conversation-session__copy'>
              <Text className='conversation-session__title'>同一轮双向沟通</Text>
              <Text className='conversation-session__hint'>
                患者表达与照护者确认会归入同一对话，30 分钟无操作后自动换新。
              </Text>
              {conversationNotice && (
                <Text
                  id='conversation-session-notice'
                  className='conversation-session__notice'
                >
                  {conversationNotice}
                </Text>
              )}
            </View>
            <Button
              id='conversation-session-reset'
              className='conversation-session__reset'
              onClick={() => {
                void startNewConversation()
              }}
            >
              新对话
            </Button>
          </View>

          <View className='utility-actions'>
            <Button
              id='saved-phrase-manager-button'
              className='utility-action'
              onClick={() => openManagementPage('phrases')}
            >
              常用语管理
            </Button>
            <Button
              id='history-manager-button'
              className='utility-action'
              onClick={() => openManagementPage('history')}
            >
              全部历史
            </Button>
            {canEditLibrary && (
              <Button
                id='board-manager-button'
                className='utility-action'
                onClick={() => {
                  void Taro.navigateTo({
                    url: '/packages/backup/pages/boards/index'
                  }).catch(() => {
                    setConversationNotice(
                      '暂时无法打开板块管理，请重试。'
                    )
                  })
                }}
              >
                板块管理
              </Button>
            )}
            <Button
              id='communication-settings-button'
              className='utility-action'
              onClick={() => openManagementPage('settings')}
            >
              照护设置
            </Button>
            <Button
              id='matching-diagnostics-button'
              className='utility-action'
              onClick={() => openManagementPage('diagnostics')}
            >
              匹配诊断
            </Button>
          </View>
        </View>
      )}

      {(pendingDraft || draftReadError) && (
        <View className='panel expression-draft-recovery' id='expression-draft-recovery'>
          <Text className='section-heading__title'>
            {draftReadError ? '表达草稿暂时不可用' : '上次表达尚未完成'}
          </Text>
          {draftReadError ? (
            <>
              <Text>{draftReadError}</Text>
              <Button id='expression-draft-retry-read-button' onClick={retryDraftRead}>重新读取</Button>
            </>
          ) : pendingDraft && (
            <>
              {!draftDeferred && <>
                <Text>{pendingDraft.snapshot.pipeline.candidateSentences[pendingDraft.snapshot.pipeline.selectedIndex] ||
                  pendingDraft.snapshot.pipeline.outputSnapshot.map(tile => tile.label).join(' / ')}</Text>
                <Text>保存时间：{new Date(pendingDraft.updatedAt).toLocaleString()}</Text>
                <Text>继续不会自动播报、搜图或调用 AI。</Text>
              </>}
              <Button id='expression-draft-continue-button' onClick={continueDraft}>继续上次表达</Button>
              <Button id='expression-draft-new-button' onClick={() => void discardPendingDraft()}>开始新表达</Button>
              {!draftDeferred && <Button id='expression-draft-defer-button' onClick={() => setDraftDeferred(true)}>暂不处理</Button>}
              {draftDeferred && <Text>草稿仍保留。开始编辑前请选择继续或开始新表达。</Text>}
            </>
          )}
        </View>
      )}

      {!pendingDraft && !draftReadError && <ExpressionWorkspace
        key={`express-${expressionScopeRef.current}-${workspaceRevision}`}
        boards={communicationBoards}
        session={expressionSession}
        dispatch={expressionDispatch}
        savedPhrases={[...savedPhraseItems, ...sharedPhraseItems]}
        conversationContext={repositoryRef.current.loadConversationContext({
          sessionId: conversationSession.id,
          maxTurns: 6
        })}
        candidateFeedbackSyncAvailable={Boolean(accountSession)}
        initialCandidateFeedbackDraft={
          findExpressionCandidateFeedbackDraft(
            repositoryRef.current.loadExpressionCandidateFeedbackDrafts(),
            {
              sessionId: conversationSession.id,
              outputSignature: expressionSession.pipeline.outputSignature,
              candidateSentences:
                expressionSession.pipeline.candidateSentences
            }
          )
        }
        speechRate={preferences.speechRate}
        candidateAutoplayDelaySeconds={
          preferences.candidateAutoplayDelaySeconds
        }
        pictogramSortMode={preferences.pictogramSortMode}
        pictogramOrdering={pictogramOrdering}
        draftService={draftServiceRef.current!}
        initialExpressionDraft={restoredDraft?.snapshot || null}
        onConfirm={appendHistory}
        onSaveCandidateFeedbackDraft={saveCandidateFeedbackDraft}
        onDiscardCandidateFeedbackDraft={discardCandidateFeedbackDraft}
        onSavePhrase={savePhrase}
        onReusePhrase={reusePhrase}
        onUseSavedPhrase={markPhraseUsed}
        onPictogramUsed={recordPictogramUse}
      />}

      <View className='history-summary'>
        <Text className='history-summary__title'>最近沟通</Text>
        <Text className='history-summary__count'>
          当前设备共保存 {historyItems.length} 条，进入“全部历史”可重播、收藏、删除或导出。
        </Text>
      </View>

      <Text className='boundary-note'>
        {process.env.TARO_APP_CARE_COLLABORATION === 'true'
          ? '普通沟通历史仅在本机保留最近 50 条；收藏独立保存，可按权限同步。患者图库和沟通偏好随档案同步。缺图搜索只发送单个缺词；粤语录音识别仅在每次明确同意后临时发送录音。'
          : '缺图搜索只发送单个缺词；个人熟悉图片始终只在本机；账号同步只上传常用语和文字历史。粤语录音识别仅在每次明确同意后临时发送录音，且不写入沟通历史。'}
      </Text>
    </View>
  )
}
