import { useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { CommunicationPreferences } from '@cboard-communication-core/communicationPreferences'
import type {
  CommunicationServiceReadiness
} from '@cboard-communication-core/serviceReadiness'
import {
  getBoardDTOTilesInDisplayOrder,
  type BoardDTO,
  type TileDTO
} from '@cboard-communication-core/dto'
import type {
  CommunicationHistoryEntry,
  CommunicationSavedPhraseEntry
} from '@cboard-communication-core/repository'
import {
  applyPersonalImagePreferencesToBoards,
  type PersonalImagePreference
} from '@cboard-communication-core/personalImagePreferences'
import type {
  PictogramOrderingState
} from '@cboard-communication-core/pictogramOrdering'
import {
  buildWorkspaceCorrectionMemory
} from '@cboard-communication-core/correctionMemory'
import type {
  ReceiverCorrectionEntry
} from '@cboard-communication-core/receiverLifecycle'

import type {
  CboardAccountSession,
  CboardApiResult,
  CboardPhoneVerificationChallenge,
  CboardPhoneVerificationConfiguration,
  CboardPhoneVerificationConfirmation
} from '../../../../platform/cboardAccountPort'
import {
  executeCboardAccountDeletion
} from '../../../../platform/accountDeletion'
import { runPostLoginAccountMerge } from '../../../../platform/accountMerge'
import {
  createCommunicationCloudSyncService
} from '../../../../platform/communicationCloudSync'
import {
  taroCboardAccountPort,
  taroCboardSessionStore
} from '../../../../platform/taroCboardAccountPort'
import {
  taroCommunicationNavigationIntent
} from '../../../../platform/taroCommunicationNavigationIntent'
import {
  taroCommunicationPreferencesStore
} from '../../../../platform/taroCommunicationPreferencesStore'
import {
  taroPictogramOrderingStore
} from '../../../../platform/taroPictogramOrderingStore'
import {
  taroCommunicationAiPort
} from '../../../../platform/taroCommunicationAiPort'
import {
  taroCommunicationServiceReadinessPort
} from '../../../../platform/taroCommunicationServiceReadinessPort'
import {
  cboardApiSpeechPort
} from '../../../../platform/taroSpeechPort'
import {
  createTaroCommunicationRepository
} from '../../../../platform/taroCommunicationRepository'
import {
  taroPictureLibraryStore
} from '../../../../platform/taroPictureLibraryStore'
import CommunicationSettingsPanel from '../../../../features/communication/CommunicationSettingsPanel'
import CompliancePanel from '../../../../features/compliance/CompliancePanel'
import { runCommunicationAiConnectionTest } from '../../../../features/communication/communicationAiConnectionTest'
import HistoryManager from '../../../../features/communication/HistoryManager'
import MatchingDiagnosticsPanel from '../../../../features/communication/MatchingDiagnosticsPanel'
import SavedPhraseManager from '../../../../features/communication/SavedPhraseManager'
import {
  createCommunicationManagementService
} from '../../../../features/communication/management'
import '../../../../features/communication/CommunicationPage.css'

type ManagementView = 'phrases' | 'history' | 'settings' | 'diagnostics'

function normalizeManagementView(value?: string): ManagementView {
  return value === 'phrases' ||
    value === 'history' ||
    value === 'settings' ||
    value === 'diagnostics'
    ? value
    : 'settings'
}

export default function CommunicationManagementPage() {
  const router = useRouter()
  const view = normalizeManagementView(router.params.view)
  const repositoryRef = useRef(createTaroCommunicationRepository())
  const identityRef = useRef(
    repositoryRef.current.loadCommunicationIdentity()
  )
  const initialBoardsRef = useRef<BoardDTO[]>(
    taroPictureLibraryStore.load()
  )
  const initialPersonalImagesRef = useRef<PersonalImagePreference[]>(
    repositoryRef.current.loadPersonalImagePreferences()
  )
  const initialPersonalizedBoardsRef = useRef(
    applyPersonalImagePreferencesToBoards(
      initialBoardsRef.current,
      initialPersonalImagesRef.current,
      identityRef.current
    )
  )
  const managementServiceRef = useRef(
    createCommunicationManagementService({
      repository: repositoryRef.current,
      boards: initialPersonalizedBoardsRef.current
    })
  )
  const cloudSyncServiceRef = useRef(
    createCommunicationCloudSyncService({
      repository: repositoryRef.current,
      settingsPort: taroCboardAccountPort
    })
  )
  const initialSessionRef = useRef<
    CboardAccountSession | null | undefined
  >(undefined)
  if (initialSessionRef.current === undefined) {
    initialSessionRef.current = taroCboardSessionStore.load()
  }

  const [boards, setBoards] = useState(initialBoardsRef.current)
  const [personalImages, setPersonalImages] = useState(
    initialPersonalImagesRef.current
  )
  const [preferences, setPreferences] = useState<CommunicationPreferences>(
    taroCommunicationPreferencesStore.load()
  )
  const [pictogramOrdering, setPictogramOrdering] =
    useState<PictogramOrderingState>(
      taroPictogramOrderingStore.load()
    )
  const [accountSession, setAccountSession] = useState(
    initialSessionRef.current
  )
  const [accountBusy, setAccountBusy] = useState(false)
  const accountDeletionInFlightRef = useRef(false)
  const [accountNotice, setAccountNotice] = useState('')
  const [serviceReadiness, setServiceReadiness] =
    useState<CommunicationServiceReadiness | null>(null)
  const [serviceBusy, setServiceBusy] = useState(false)
  const [serviceNotice, setServiceNotice] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNotice, setAiNotice] = useState('')
  const [aiTestBusy, setAiTestBusy] = useState(false)
  const [aiTestNotice, setAiTestNotice] = useState('')
  const [speechVoiceDefault, setSpeechVoiceDefault] = useState('')
  const [speechVoices, setSpeechVoices] = useState<string[]>([])
  const [speechPreviewBusy, setSpeechPreviewBusy] = useState(false)
  const [speechPreviewNotice, setSpeechPreviewNotice] = useState('')
  const speechPreviewGenerationRef = useRef(0)
  const preferencesChangedRef = useRef(false)
  const [historyItems, setHistoryItems] = useState(
    repositoryRef.current.loadCommunicationHistory()
  )
  const [receiverCorrections, setReceiverCorrections] = useState(
    repositoryRef.current.loadReceiverCorrections()
  )
  const [savedPhraseItems, setSavedPhraseItems] = useState(
    repositoryRef.current.loadCommunicationSavedPhrases()
  )

  const personalizedBoards = applyPersonalImagePreferencesToBoards(
    boards,
    personalImages,
    identityRef.current
  )
  const correctionMemory = buildWorkspaceCorrectionMemory(
    receiverCorrections,
    { workspaceId: identityRef.current.workspaceId }
  )
  const pageClassName = [
    'communication-page',
    preferences.highContrast ? 'communication-page--high-contrast' : '',
    `communication-page--font-${preferences.fontSize}`,
    `communication-page--grid-${preferences.gridColumns}`
  ].filter(Boolean).join(' ')

  useDidShow(() => {
    const nextBoards = taroPictureLibraryStore.load()
    const nextPersonalImages =
      repositoryRef.current.loadPersonalImagePreferences()
    setBoards(nextBoards)
    setPersonalImages(nextPersonalImages)
    setPreferences(taroCommunicationPreferencesStore.load())
    setPictogramOrdering(taroPictogramOrderingStore.load())
    setAccountSession(taroCboardSessionStore.load())
    setHistoryItems(repositoryRef.current.loadCommunicationHistory())
    setReceiverCorrections(
      repositoryRef.current.loadReceiverCorrections()
    )
    setSavedPhraseItems(
      repositoryRef.current.loadCommunicationSavedPhrases()
    )
    managementServiceRef.current = createCommunicationManagementService({
      repository: repositoryRef.current,
      boards: applyPersonalImagePreferencesToBoards(
        nextBoards,
        nextPersonalImages,
        identityRef.current
      )
    })
  })

  const close = () => {
    speechPreviewGenerationRef.current += 1
    cboardApiSpeechPort.stop()
    if (preferencesChangedRef.current) {
      void Taro.reLaunch({
        url: '/packages/caregiver/pages/patient/index'
      })
      return
    }
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({
        url: '/packages/caregiver/pages/patient/index'
      })
    )
  }

  const updatePreferences = (value: CommunicationPreferences) => {
    const saved = taroCommunicationPreferencesStore.save(value)
    setPreferences(saved)
    preferencesChangedRef.current = true
  }

  const movePictogram = (
    boardId: string,
    tileId: string,
    direction: 'up' | 'down'
  ) => {
    const board = boards.find(item => item.id === boardId)
    if (!board) return
    setPictogramOrdering(
      taroPictogramOrderingStore.moveManualOrder(
        getBoardDTOTilesInDisplayOrder(board) as TileDTO[],
        boardId,
        tileId,
        direction
      )
    )
  }

  const applyCloudValue = (value?: {
    savedPhrases: CommunicationSavedPhraseEntry[]
    history: CommunicationHistoryEntry[]
  }) => {
    if (!value) return
    setSavedPhraseItems(value.savedPhrases)
    setHistoryItems(value.history)
  }

  const updateManagedHistory = (
    nextItems: CommunicationHistoryEntry[]
  ) => {
    const remainingIds = new Set(
      nextItems.map(entry => entry.id).filter(Boolean)
    )
    const receiverRecords = repositoryRef.current.loadReceiverRecords()
    const deletedReceiverIds = receiverRecords
      .filter(
        entry =>
          entry.recordStatus === 'confirmed' &&
          !remainingIds.has(entry.id)
      )
      .map(entry => entry.id)
      .filter(Boolean) as string[]
    if (deletedReceiverIds.length) {
      repositoryRef.current.overwriteReceiverRecords(
        receiverRecords.filter(
          entry => !deletedReceiverIds.includes(String(entry.id || ''))
        )
      )
    }
    const deleteAll = historyItems.length > 0 && nextItems.length === 0
    setHistoryItems(nextItems)

    if (accountSession && (deleteAll || deletedReceiverIds.length)) {
      void cloudSyncServiceRef.current
        .deleteReceiverRecords(
          accountSession.token,
          deletedReceiverIds,
          { deleteAll }
        )
        .then(result => {
          if (result.value) setHistoryItems(result.value.history)
          if (!result.ok) setAccountNotice(result.message)
        })
    }
  }

  const recordReceiverCorrection = (entry: ReceiverCorrectionEntry) => {
    try {
      const saved = repositoryRef.current.appendReceiverCorrection(entry)
      if (!saved) return false
      setReceiverCorrections(
        repositoryRef.current.loadReceiverCorrections()
      )
      return true
    } catch (error) {
      return false
    }
  }

  const completeAccountLogin = async (
    result: CboardApiResult<CboardAccountSession>
  ) => {
    if (!result.ok || !result.value) {
      setAccountNotice(result.message)
      return false
    }
    const session = taroCboardSessionStore.save(result.value)
    if (!session) {
      setAccountNotice('登录信息无法保存，请检查设备存储后重试。')
      return false
    }
    setAccountSession(session)
    const syncResult = await runPostLoginAccountMerge({
      session,
      repository: repositoryRef.current,
      cloudSync: cloudSyncServiceRef.current,
      confirm: async dialog => {
        const response = await Taro.showModal({
          title: dialog.title,
          content: dialog.content,
          confirmText: dialog.confirmText,
          cancelText: dialog.cancelText
        })
        return Boolean(response.confirm)
      }
    })
    applyCloudValue(syncResult.value)
    setAccountNotice(`${result.message} ${syncResult.message}`)
    return true
  }

  const runAccountLogin = async (
    request: () => Promise<CboardApiResult<CboardAccountSession>>
  ) => {
    if (accountBusy) return false
    setAccountBusy(true)
    try {
      return await completeAccountLogin(await request())
    } finally {
      setAccountBusy(false)
    }
  }

  const loginAccount = (input: {
    email: string
    password: string
  }) => runAccountLogin(() => taroCboardAccountPort.login(input))

  const loginAccountWithPhone = (input: {
    phone: string
    phoneVerificationToken: string
  }) => runAccountLogin(() => taroCboardAccountPort.loginWithPhone(input))

  const registerAccount = async (input: {
    name: string
    email: string
    phone: string
    password: string
    phoneVerificationToken?: string
  }) => {
    if (accountBusy) return false
    setAccountBusy(true)
    try {
      const result = await taroCboardAccountPort.register(input)
      setAccountNotice(result.message)
      return result.ok
    } finally {
      setAccountBusy(false)
    }
  }

  const getPhoneVerificationConfiguration = async (): Promise<
    CboardApiResult<CboardPhoneVerificationConfiguration>
  > => taroCboardAccountPort.getPhoneVerificationConfiguration()

  const requestPhoneVerification = async (input: {
    phone: string
    purpose?: 'registration' | 'login' | 'password-reset'
  }): Promise<CboardApiResult<CboardPhoneVerificationChallenge>> => {
    const result = await taroCboardAccountPort.requestPhoneVerification(input)
    setAccountNotice(result.message)
    return result
  }

  const confirmPhoneVerification = async (input: {
    challengeId: string
    phone: string
    code: string
    purpose?: 'registration' | 'login' | 'password-reset'
  }): Promise<CboardApiResult<CboardPhoneVerificationConfirmation>> => {
    const result = await taroCboardAccountPort.confirmPhoneVerification(input)
    setAccountNotice(result.message)
    return result
  }

  const requestPasswordReset = async (input: { email: string }) => {
    if (accountBusy) return false
    setAccountBusy(true)
    try {
      const result = await taroCboardAccountPort.requestPasswordReset(input)
      setAccountNotice(result.message)
      return result.ok
    } finally {
      setAccountBusy(false)
    }
  }

  const resetPasswordWithPhone = async (input: {
    phone: string
    phoneVerificationToken: string
    password: string
  }) => {
    if (accountBusy) return false
    setAccountBusy(true)
    try {
      const result =
        await taroCboardAccountPort.resetPasswordWithPhone(input)
      setAccountNotice(result.message)
      return result.ok
    } finally {
      setAccountBusy(false)
    }
  }

  const syncAccount = async () => {
    if (!accountSession || accountBusy) {
      if (!accountSession) setAccountNotice('请先登录，再同步云端数据。')
      return
    }
    setAccountBusy(true)
    try {
      const result = await cloudSyncServiceRef.current.sync(
        accountSession.token,
        { accountUserId: accountSession.user.id }
      )
      applyCloudValue(result.value)
      setAccountNotice(result.message)
    } finally {
      setAccountBusy(false)
    }
  }

  const uploadAccount = async () => {
    if (!accountSession || accountBusy) {
      if (!accountSession) setAccountNotice('请先登录，再上传本机数据。')
      return
    }
    setAccountBusy(true)
    try {
      const result = await cloudSyncServiceRef.current.upload(
        accountSession.token,
        { accountUserId: accountSession.user.id }
      )
      applyCloudValue(result.value)
      setAccountNotice(result.message)
    } finally {
      setAccountBusy(false)
    }
  }

  const logoutAccount = () => {
    taroCboardSessionStore.clear()
    setAccountSession(null)
    setAccountNotice('已退出账号，本机常用语和沟通历史仍然保留。')
  }

  const deleteAccount = async () => {
    if (!accountSession || accountBusy || accountDeletionInFlightRef.current) {
      if (!accountSession) setAccountNotice('请先登录，再删除云端账号。')
      return false
    }

    accountDeletionInFlightRef.current = true
    setAccountBusy(true)
    try {
      const result = await executeCboardAccountDeletion({
        session: accountSession,
        accountPort: taroCboardAccountPort,
        clearSession: () => taroCboardSessionStore.clear(),
        confirm: async () => {
          const confirmation = await Taro.showModal({
            title: '永久删除 CBoard 云端账号',
            content:
              '此操作无法撤销。云端账号和同步数据会被删除；当前设备上的图卡、家庭图片和沟通历史仍会保留。',
            confirmText: '永久删除',
            confirmColor: '#b91c1c',
            cancelText: '取消'
          })
          return Boolean(confirmation.confirm)
        }
      })
      if (result.deleted) setAccountSession(null)
      setAccountNotice(result.message)
      return result.deleted
    } finally {
      accountDeletionInFlightRef.current = false
      setAccountBusy(false)
    }
  }

  const checkServiceReadiness = async () => {
    if (serviceBusy) return
    setServiceBusy(true)
    try {
      const result = await taroCommunicationServiceReadinessPort.check()
      setServiceReadiness(result.value || null)
      setServiceNotice(result.message)
    } finally {
      setServiceBusy(false)
    }
  }

  const checkAiService = async () => {
    if (aiBusy) return
    setAiBusy(true)
    try {
      const result = await taroCommunicationAiPort.health()
      const usageResult = result.ok
        ? await taroCommunicationAiPort.usage()
        : null
      if (!result.ok || !result.value) {
        setSpeechVoiceDefault('')
        setSpeechVoices([])
        setAiNotice(result.message)
        return
      }
      setSpeechVoiceDefault(result.value.speechVoice)
      setSpeechVoices(result.value.speechVoices)
      const voiceWasRemoved = Boolean(
        result.value.speechConfigured &&
        result.value.speechVoices.length &&
        preferences.speechVoice &&
        !result.value.speechVoices.includes(preferences.speechVoice)
      )
      if (voiceWasRemoved) {
        updatePreferences({ ...preferences, speechVoice: '' })
        setSpeechPreviewNotice(
          '之前选择的音色已不在服务器清单中，已恢复服务器默认音色。'
        )
      }
      if (
        !result.value.configured &&
        !result.value.speechConfigured &&
        !result.value.dialectAsrConfigured &&
        !result.value.backgroundRemovalConfigured
      ) {
        setAiNotice('cboard-api 尚未配置可选增强服务，当前继续使用本地能力。')
        return
      }
      const capabilities: string[] = []
      if (result.value.configured) {
        capabilities.push(
          `AI：${result.value.provider} / ${result.value.model}`
        )
      }
      if (result.value.imageAiConfigured) {
        capabilities.push('图片识字与图卡建议：已配置同一图片 AI 模型')
      }
      if (result.value.dialectAsrConfigured) {
        capabilities.push(
          `粤语录音识别：${result.value.dialectAsrProvider} / ${result.value.dialectAsrEngine}`
        )
      }
      if (result.value.backgroundRemovalConfigured) {
        capabilities.push(
          `图片去背景：${result.value.backgroundRemovalProvider}`
        )
      }
      if (result.value.speechConfigured) {
        capabilities.push(
          `语音回退：${result.value.speechProvider} / ${result.value.speechModel} / ${result.value.speechVoices.length} 个音色`
        )
      }
      if (result.value.enhancementRateLimitEnabled) {
        capabilities.push(
          `增强服务额度：每分钟 ${result.value.enhancementPointsPerMinute} 点 / 每月 ${result.value.enhancementMonthlyPoints} 点`
        )
      }
      if (result.value.aiTokenQuotaEnabled) {
        capabilities.push(
          `AI Token 月额度：${result.value.aiMonthlyTokenQuota}`
        )
      }
      if (usageResult && usageResult.ok && usageResult.value) {
        const usage = usageResult.value
        if (usage.tokenQuota && usage.tokenQuota.enabled) {
          capabilities.push(
            `AI Token 剩余（${usage.tokenQuota.month}）：${usage.tokenQuota.remainingTokens} / ${usage.tokenQuota.limitTokens}`
          )
        }
        capabilities.push(
          usage.requestCount > 0
            ? `AI 用量（${usage.month}）：${usage.totalTokens} 个服务商回报 Token / ${usage.requestCount} 次调用${
                usage.unreportedRequestCount > 0
                  ? `，其中 ${usage.unreportedRequestCount} 次未回报 Token`
                  : ''
              }`
            : `AI 用量（${usage.month}）：暂无计量模型调用`
        )
      }
      setAiNotice(capabilities.join('；'))
    } finally {
      setAiBusy(false)
    }
  }

  const testAiConnection = async () => {
    if (aiTestBusy) return
    setAiTestBusy(true)
    try {
      const result = await runCommunicationAiConnectionTest(
        taroCommunicationAiPort
      )
      setAiTestNotice(result.message)
    } finally {
      setAiTestBusy(false)
    }
  }

  const previewSpeechVoice = async (voice: string) => {
    if (speechPreviewBusy) {
      speechPreviewGenerationRef.current += 1
      cboardApiSpeechPort.stop()
      setSpeechPreviewBusy(false)
      setSpeechPreviewNotice('试听已停止。')
      return
    }
    if (!accountSession) {
      setSpeechPreviewNotice('请先登录 CBoard 账号，再试听服务端音色。')
      return
    }
    if (!voice || !speechVoices.includes(voice)) {
      setSpeechPreviewNotice('当前音色不在服务器允许清单中，请重新检测。')
      return
    }

    const generation = ++speechPreviewGenerationRef.current
    setSpeechPreviewBusy(true)
    setSpeechPreviewNotice('正在生成并试听服务端后备音色…')
    const result = await cboardApiSpeechPort.speak(
      '你好，我是图语家。这是服务端后备音色试听。',
      {
        rate: preferences.speechRate,
        voice
      }
    )
    if (generation !== speechPreviewGenerationRef.current) return
    setSpeechPreviewBusy(false)
    setSpeechPreviewNotice(result.message)
  }

  const reusePhrase = (entry: CommunicationSavedPhraseEntry) => {
    if (!entry.id) return
    if (
      taroCommunicationNavigationIntent.save({
        reuseSavedPhraseId: entry.id
      })
    ) {
      close()
    }
  }

  const replayOnboarding = () => {
    updatePreferences({
      ...preferences,
      onboardingComplete: false
    })
    close()
  }

  const title =
    view === 'phrases'
      ? '常用语管理'
      : view === 'history'
        ? '全部沟通历史'
        : view === 'diagnostics'
          ? '图文匹配诊断'
          : '照护设置'

  return (
    <View className={pageClassName}>
      <View className='utility-page__header'>
        <View>
          <Text className='utility-page__eyebrow'>图语家 · 照护工具</Text>
          <Text className='utility-page__title'>{title}</Text>
        </View>
        <Button className='utility-page__back' onClick={close}>
          返回沟通
        </Button>
      </View>

      {view === 'phrases' && (
        <SavedPhraseManager
          service={managementServiceRef.current}
          items={savedPhraseItems}
          speechRate={preferences.speechRate}
          onItemsChange={setSavedPhraseItems}
          onReuse={reusePhrase}
        />
      )}
      {view === 'history' && (
        <HistoryManager
          service={managementServiceRef.current}
          items={historyItems}
          boards={personalizedBoards}
          receiverCorrections={receiverCorrections}
          speechRate={preferences.speechRate}
          candidateFeedbackSyncAvailable={Boolean(accountSession)}
          onItemsChange={updateManagedHistory}
          onRecordReceiverCorrection={recordReceiverCorrection}
        />
      )}
      {view === 'diagnostics' && (
        <MatchingDiagnosticsPanel
          boards={personalizedBoards}
          correctionMemory={correctionMemory}
        />
      )}
      {view === 'settings' && (
        <>
        <CommunicationSettingsPanel
          boards={boards}
          value={preferences}
          pictogramOrdering={pictogramOrdering}
          accountConfigured={taroCboardAccountPort.configured}
          accountSession={accountSession}
          accountBusy={accountBusy}
          accountNotice={accountNotice}
          serviceConfigured={taroCommunicationServiceReadinessPort.configured}
          serviceReadiness={serviceReadiness}
          serviceBusy={serviceBusy}
          serviceNotice={serviceNotice}
          aiConfigured={taroCommunicationAiPort.configured}
          aiBusy={aiBusy}
          aiNotice={aiNotice}
          aiTestBusy={aiTestBusy}
          aiTestNotice={aiTestNotice}
          speechVoiceDefault={speechVoiceDefault}
          speechVoices={speechVoices}
          speechPreviewBusy={speechPreviewBusy}
          speechPreviewNotice={speechPreviewNotice}
          onChange={updatePreferences}
          onMovePictogram={movePictogram}
          onAccountLogin={loginAccount}
          onAccountPhoneLogin={loginAccountWithPhone}
          onAccountRegister={registerAccount}
          onGetPhoneVerificationConfiguration={
            getPhoneVerificationConfiguration
          }
          onRequestPhoneVerification={requestPhoneVerification}
          onConfirmPhoneVerification={confirmPhoneVerification}
          onAccountRequestPasswordReset={requestPasswordReset}
          onAccountResetPasswordWithPhone={resetPasswordWithPhone}
          onAccountDelete={deleteAccount}
          onAccountLogout={logoutAccount}
          onAccountSync={syncAccount}
          onAccountUpload={uploadAccount}
          onCheckService={checkServiceReadiness}
          onCheckAi={checkAiService}
          onTestAi={testAiConnection}
          onPreviewSpeechVoice={previewSpeechVoice}
          onOpenPictureLibraryManagement={() => {
            void Taro.navigateTo({
              url: '/packages/backup/pages/personal-images/index'
            })
          }}
          onOpenPictureLibraryBackup={() => {
            void Taro.navigateTo({
              url: '/packages/backup/pages/library/index'
            })
          }}
          onReplayOnboarding={replayOnboarding}
        />
        <CompliancePanel />
        </>
      )}
    </View>
  )
}
