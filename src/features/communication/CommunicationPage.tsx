import { useReducer, useRef, useState } from 'react'
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
import type {
  CommunicationHistoryEntry,
  CommunicationSavedPhraseEntry
} from '@cboard-communication-core/repository'
import {
  getCommunicationQuickPhrases,
  markCommunicationSavedPhraseUsed
} from '@cboard-communication-core/savedPhraseManagement'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'
import {
  applyPersonalImagePreferencesToBoards,
  applyPersonalImagePreferencesToItems,
  type PersonalImagePreference
} from '@cboard-communication-core/personalImagePreferences'
import type {
  PictogramOrderingState
} from '@cboard-communication-core/pictogramOrdering'
import type { CboardAccountSession } from '../../platform/cboardAccountPort'
import { taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import { taroCommunicationNavigationIntent } from '../../platform/taroCommunicationNavigationIntent'
import { taroCommunicationPreferencesStore } from '../../platform/taroCommunicationPreferencesStore'
import { taroPictogramOrderingStore } from '../../platform/taroPictogramOrderingStore'
import { createTaroCommunicationRepository } from '../../platform/taroCommunicationRepository'
import { taroPictureLibraryStore } from '../../platform/taroPictureLibraryStore'
import CommunicationOnboarding from './CommunicationOnboarding'
import ExpressionWorkspace from './ExpressionWorkspace'
import NetworkStatusNotice from './NetworkStatusNotice'
import PatientActionButton from './PatientActionButton'
import {
  createExpressionSessionFromSavedPhrase,
  createExpressionSessionFromTileReferences,
  expressionSessionReducer,
  restoreExpressionSession,
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

export default function CommunicationPage() {
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
  const initialLibraryBoardsRef = useRef<BoardDTO[] | null>(null)
  if (!initialLibraryBoardsRef.current) {
    initialLibraryBoardsRef.current = taroPictureLibraryStore.load()
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
  const initialPersonalizedBoardsRef = useRef(
    applyPersonalImagePreferencesToBoards(
      initialLibraryBoardsRef.current,
      initialPersonalImagePreferencesRef.current,
      communicationIdentity
    )
  )
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
    initialSessionRef.current = restoreExpressionSession(
      initialPersonalizedBoardsRef.current,
      initialHistoryRef.current,
      initialConversationSessionRef.current.id
    )
  }

  const [expressionSession, expressionDispatch] = useReducer(
    expressionSessionReducer,
    initialSessionRef.current
  )
  const expressionSessionRef = useRef(expressionSession)
  expressionSessionRef.current = expressionSession
  const [showCaregiverTools, setShowCaregiverTools] = useState(false)
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
  const [libraryRevision, setLibraryRevision] = useState(0)
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
  const personalImageSignature = createPersonalImageSignature(
    personalImagePreferences
  )
  const pageClassName = [
    'communication-page',
    preferences.highContrast ? 'communication-page--high-contrast' : '',
    `communication-page--font-${preferences.fontSize}`,
    `communication-page--grid-${preferences.gridColumns}`
  ].filter(Boolean).join(' ')

  const markPhraseUsed = (entry: CommunicationSavedPhraseEntry) => {
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

  const reusePhrase = (
    entry: CommunicationSavedPhraseEntry,
    boards: BoardDTO[] = personalizedBoards
  ) => {
    const nextSession = createExpressionSessionFromSavedPhrase(
      boards,
      entry
    )
    if (!nextSession.selectedTiles.length) return false

    markPhraseUsed(entry)
    expressionDispatch({ type: 'replace-session', state: nextSession })
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
    taroCommunicationNavigationIntent.save({
      expressionDraft: expressionSession.selectedTiles.map(tile => ({
        id: tile.id,
        boardId: tile.boardId
      }))
    })
    void Taro.navigateTo({
      url: `/packages/management/pages/index/index?view=${view}`
    }).catch(() => {
      setConversationNotice('暂时无法打开照护工具，请重试。')
    })
  }

  useDidShow(() => {
    const nextConversation =
      repositoryRef.current.getActiveConversationSession()
    setConversationSession(current => {
      if (current.id !== nextConversation.id) {
        expressionDispatch({ type: 'clear' })
      }
      return nextConversation
    })
    setHistoryItems(repositoryRef.current.loadCommunicationHistory())
    const nextSavedPhrases =
      repositoryRef.current.loadCommunicationSavedPhrases()
    setSavedPhraseItems(nextSavedPhrases)
    const nextPersonalImagePreferences =
      repositoryRef.current.loadPersonalImagePreferences()
    const nextLibraryBoards = taroPictureLibraryStore.load()
    const nextPersonalizedBoards = applyPersonalImagePreferencesToBoards(
      nextLibraryBoards,
      nextPersonalImagePreferences,
      communicationIdentity
    )
    const nextPersonalImageSignature = createPersonalImageSignature(
      nextPersonalImagePreferences
    )
    if (
      nextPersonalImageSignature !==
      personalImageSignatureRef.current
    ) {
      const currentExpressionSession = expressionSessionRef.current
      expressionDispatch({
        type: 'replace-session',
        state: {
          ...currentExpressionSession,
          selectedTiles: applyPersonalImagePreferencesToItems(
            currentExpressionSession.selectedTiles,
            nextPersonalImagePreferences,
            communicationIdentity
          ),
          pipeline: {
            ...currentExpressionSession.pipeline,
            outputSnapshot: applyPersonalImagePreferencesToItems(
              currentExpressionSession.pipeline.outputSnapshot,
              nextPersonalImagePreferences,
              communicationIdentity
            )
          }
        }
      })
    }
    personalImageSignatureRef.current =
      nextPersonalImageSignature
    setPersonalImagePreferences(nextPersonalImagePreferences)
    setLibraryBoards(nextLibraryBoards)
    const nextLibraryVersion = JSON.stringify(nextLibraryBoards)
    if (nextLibraryVersion !== libraryVersionRef.current) {
      libraryVersionRef.current = nextLibraryVersion
      setLibraryRevision(value => value + 1)
      expressionDispatch({ type: 'clear' })
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
    } else if (navigationIntent && navigationIntent.expressionDraft) {
      const draftSession = createExpressionSessionFromTileReferences(
        nextPersonalizedBoards,
        navigationIntent.expressionDraft
      )
      if (draftSession.selectedTiles.length) {
        expressionDispatch({ type: 'replace-session', state: draftSession })
      }
    }
    if (navigationIntent && navigationIntent.showCaregiverTools) {
      setShowCaregiverTools(true)
    }
  })

  const appendHistory = (entry: CommunicationHistoryEntry) => {
    try {
      const persisted =
        repositoryRef.current.appendCommunicationHistory(entry)
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
    try {
      repositoryRef.current.saveCommunicationPhrase(entry)
      setSavedPhraseItems(
        repositoryRef.current.loadCommunicationSavedPhrases()
      )
      return true
    } catch (error) {
      return false
    }
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
      expressionDispatch({ type: 'clear' })
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

      <ExpressionWorkspace
        key={`express-${conversationSession.id}-${libraryRevision}-${preferences.hiddenBoardIds.join('-')}-${personalImageSignature}`}
        boards={communicationBoards}
        session={expressionSession}
        dispatch={expressionDispatch}
        savedPhrases={getCommunicationQuickPhrases(savedPhraseItems, 6)}
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
        onConfirm={appendHistory}
        onSaveCandidateFeedbackDraft={saveCandidateFeedbackDraft}
        onDiscardCandidateFeedbackDraft={discardCandidateFeedbackDraft}
        onSavePhrase={savePhrase}
        onReusePhrase={reusePhrase}
        onUseSavedPhrase={markPhraseUsed}
        onPictogramUsed={recordPictogramUse}
      />

      <View className='history-summary'>
        <Text className='history-summary__title'>最近沟通</Text>
        <Text className='history-summary__count'>
          当前设备共保存 {historyItems.length} 条，进入“全部历史”可重播、收藏、删除或导出。
        </Text>
      </View>

      <Text className='boundary-note'>
        缺图搜索只发送单个缺词；个人熟悉图片始终只在本机；账号同步只上传常用语和文字历史。粤语录音识别仅在每次明确同意后临时发送录音，且不写入沟通历史。
      </Text>
    </View>
  )
}

