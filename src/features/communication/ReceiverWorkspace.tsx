import { repairCatalogImage } from '@cboard-communication-core/imageRepair'
import { getLocalPictogramCandidates } from '@cboard-communication-core/pictogramSemantics'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { verifyTaroLocalImage } from '../../platform/taroLocalImageVerification'
import { receiverDraftContentSignature } from '@cboard-communication-core/receiverDraftPersistence'
import { useEffect, useRef, useState } from 'react'
import { useDidHide } from '@tarojs/taro'
import { Button, Switch, Text, Textarea, View } from '@tarojs/components'
import {
  applyCommunicationAiResegmentation,
  buildCommunicationAiResegmentRequest
} from '@cboard-communication-core/communicationAi'
import {
  buildDialectNormalizationRequest,
  buildLocalDialectNormalization
} from '@cboard-communication-core/dialectNormalization'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type { ReceiverCorrectionMemory } from '@cboard-communication-core/correctionMemory'
import type {
  MissingTokenOccurrenceInput,
  MissingTokenRecord
} from '@cboard-communication-core/repository'
import {
  buildReceiverHistoryEntry,
  buildReceiverMeaningAssessment,
  prepareReceiverAssistedItems,
  isReceiverPunctuation,
  type ReceiverHistoryEntry
} from '@cboard-communication-core/receiverPipeline'
import {
  RECEIVER_CORRECTION_ACTIONS,
  buildReceiverCorrectionFromEdit,
  type ReceiverCorrectionEntry,
  type ReceiverDraftEntry
} from '@cboard-communication-core/receiverLifecycle'
import type { CommunicationOutputItem } from '@cboard-communication-core/symbolMatching'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'
import { getReceiverRepairSource, withReceiverRepair, RECEIVER_PARTNER_GUIDANCE } from '@cboard-communication-core/receiverRepair'

import type {
  ImageTextRecognitionIntent
} from './imageTextRecognitionIntent'
import {
  WECHAT_RECOGNITION_UNAVAILABLE_MESSAGE
} from '../../platform/recognitionPort'
import { taroCommunicationAiPort } from '../../platform/taroCommunicationAiPort'
import { getTaroTextAiAvailability, openTextAiSetup, useTaroTextAiAvailability } from '../../platform/taroTextAiAvailability'
import { taroDialectAudioRecognitionPort } from '../../platform/taroDialectAudioRecognitionPort'
import { wechatRecognitionPort } from '../../platform/taroRecognitionPort'
import { wechatSpeechPort } from '../../platform/taroSpeechPort'
import BoardNavigator from './BoardNavigator'
import PatientActionButton from './PatientActionButton'
import PictogramImage from '../../components/PictogramImage'
import ImageRepairControls from '../../components/ImageRepairControls'
import MissingTokenQueue, {
  type MissingTokenOnlineResult,
  type MissingTokenReview
} from './MissingTokenQueue'
import {
  createBoardNavigationState,
  getActiveNavigationBoard,
  getBoardTileKey,
  getVisibleBoardTiles,
  isNavigationTile,
  openNavigationTile
} from './boardNavigation'
import {
  buildConfirmedReceiverHistory,
  createReceiverWorkspaceResumeState,
  createReceiverItemId,
  createEmptyReceiverSession,
  createReceiverWorkspaceFromRecognizedText,
  deleteReceiverItem,
  formatReceiverSegmentation,
  getReceiverReplacementCatalog,
  insertReceiverItem,
  moveReceiverItem,
  parseReceiverSegmentationInput,
  refreshReceiverMissingItems,
  replaceReceiverItem,
  replaceReceiverReviewItems,
  retainReceiverItemAsText,
  type ReceiverWorkspaceResumeState,
  runReceiverSession,
  updateReceiverInput
} from './receiverSession'

import { restoreReceiverWorkspaceFromRecord } from './receiverSession'

export interface ReceiverWorkspaceProps {
  preparationMode?: boolean
  externalSaveError?: string
  preparationSaveLabel?: string
  onConfirmPreparedPhrase?: (entry: ReceiverHistoryEntry) => boolean
  boards: BoardDTO[]
  initialState?: ReceiverWorkspaceResumeState | null
  receiverRecords?: unknown[]
  imageTextRecognitionIntent?: ImageTextRecognitionIntent | null
  onOpenImageTextRecognition?: () => void
  onConfirm: (entry: ReceiverHistoryEntry) => boolean
  onCreateDraft: (entry: ReceiverHistoryEntry) => ReceiverDraftEntry | null
  onUpdateDraft: (draft: ReceiverDraftEntry, entry: ReceiverHistoryEntry) => ReceiverDraftEntry | null
  onConfirmDraft: (draft: ReceiverDraftEntry, entry: ReceiverHistoryEntry) => ReceiverDraftEntry | null
  onDiscardResumableRecord: (recordId: string, options?: { expected: ReceiverDraftEntry }) => boolean
  onRecordCorrection: (entry: ReceiverCorrectionEntry) => boolean
  onRecordMissingTokens: (entry: MissingTokenOccurrenceInput) => boolean
  missingTokenRecords: MissingTokenRecord[]
  correctionMemory: ReceiverCorrectionMemory
  onlineSearchEnabled: boolean
  onlineSearchAvailable: boolean
  onReviewMissingToken: (recordId: string, review: MissingTokenReview) => boolean
  onSearchMissingTokensOnline: (recordIds: string[]) => Promise<MissingTokenOnlineResult>
  onAcceptMissingTokenOnline: (
    recordId: string,
    pictogramId?: string
  ) => Promise<MissingTokenOnlineResult>
  onOpenDisplay: (
    items: CommunicationOutputItem[],
    speechText: string,
    recordId: string,
    resumeState: ReceiverWorkspaceResumeState,
    options?: { startSegmented?: boolean; autoPlay?: boolean }
  ) => void
}

const RECEIVER_EXAMPLES = ['想喝水', '需要休息', '开心', '不开心']
const RECOGNITION_ACTIVITY_HOLD_MS = 420
const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: '准确匹配',
  synonym: '同义词',
  lexicon: '词典匹配',
  'lexicon-synonym': '词典匹配',
  partial: '部分匹配',
  manual: '人工确认',
  online: '在线图卡（已确认）',
  ai: 'AI 分词',
  none: '未匹配',
  missing: '未匹配'
}

export default function ReceiverWorkspace({
  preparationMode = false,
  externalSaveError = '',
  preparationSaveLabel = '确认存为常用语',
  onConfirmPreparedPhrase,
  boards,
  initialState,
  receiverRecords = [],
  imageTextRecognitionIntent,
  onOpenImageTextRecognition,
  onConfirm,
  onCreateDraft,
  onUpdateDraft,
  onConfirmDraft,
  onDiscardResumableRecord,
  onRecordCorrection,
  onRecordMissingTokens,
  missingTokenRecords,
  correctionMemory,
  onlineSearchEnabled,
  onlineSearchAvailable,
  onReviewMissingToken,
  onSearchMissingTokensOnline,
  onAcceptMissingTokenOnline,
  onOpenDisplay
}: ReceiverWorkspaceProps) {
  const [boardNavigation, setBoardNavigation] = useState(() =>
    createBoardNavigationState(boards)
  )
  const [session, setSession] = useState(() =>
    (initialState && initialState.session) || createEmptyReceiverSession()
  )
  const [segmentationDraft, setSegmentationDraft] = useState(
    (initialState && initialState.segmentationDraft) || ''
  )
  const [activeDraft, setActiveDraftState] = useState<ReceiverDraftEntry | null>(
    (initialState && initialState.activeDraft) || null
  )
  const activeDraftRef = useRef(activeDraft)
  const [draftSaveError, setDraftSaveError] = useState('')
  const setActiveDraft = (record: ReceiverDraftEntry | null) => {
    setDraftSaveError('')
    activeDraftRef.current = record
    setActiveDraftState(record)
  }
  const [repairSource, setRepairSource] = useState<ReceiverDraftEntry | null>(() =>
    initialState?.repairSource || getReceiverRepairSource(activeDraft, receiverRecords) ||
    (activeDraft?.recordStatus === 'confirmed' && activeDraft.patientFeedback === 'not_understood' ? activeDraft : null))
  const [repairRequested, setRepairRequested] = useState(Boolean(initialState?.repairRequested ||
    activeDraft?.repairOfRecordId || activeDraft?.patientFeedback === 'not_understood'))
  const [repairEditing, setRepairEditing] = useState(Boolean(initialState?.repairEditing || activeDraft?.repairOfRecordId))
  const [showPartnerGuidance, setShowPartnerGuidance] = useState(true)
  const displayOpeningRef = useRef(false)
  const [assistanceRequest, setAssistanceRequest] = useState<string | null>(null)
  const assistanceRef = useRef<string | null>(null)
  const candidatePendingRef = useRef(false)
  const meaning = buildReceiverMeaningAssessment(session.inputText, session.reviewItems)
  const meaningKey = JSON.stringify([session.inputText, session.reviewItems])
  const meaningKeyRef = useRef(meaningKey)
  meaningKeyRef.current = meaningKey
  useEffect(() => { assistanceRef.current = null; setAssistanceRequest(null) }, [meaningKey])
  const [replacementItemId, setReplacementItemId] = useState<string | null>(null)
  const [insertionAfterItemId, setInsertionAfterItemId] = useState<string | null>(null)
  const [notice, setNotice] = useState(
    (initialState && initialState.notice) ||
      '输入照护者想说的话，再生成图片序列。'
  )
  const [isListening, setIsListening] = useState(false)
  const [isRecognitionActivityVisible, setIsRecognitionActivityVisible] =
    useState(false)
  const [isAiResegmenting, setIsAiResegmenting] = useState(false)
  const [pendingAiSuggestion, setPendingAiSuggestion] = useState<{
    applied: ReturnType<typeof applyCommunicationAiResegmentation>
    generation: number
    signature: string
  } | null>(null)
  const [isCantoneseMode, setIsCantoneseMode] = useState(false)
  const [dialectSourceText, setDialectSourceText] = useState('')
  const [isDialectNormalizing, setIsDialectNormalizing] = useState(false)
  const [dialectAudioConsent, setDialectAudioConsent] = useState(false)
  const [dialectAudioPhase, setDialectAudioPhase] = useState<
    'idle' | 'recording' | 'recognizing'
  >('idle')
  const [learnFromCorrections, setLearnFromCorrections] = useState(
    initialState &&
      typeof initialState.learnFromCorrections === 'boolean'
      ? initialState.learnFromCorrections
      : true
  )
  const correctionMemoryProbeId =
    `receiver-correction-memory-${correctionMemory.rules.length}-` +
    correctionMemory.rules.reduce(
      (count, rule) => count + rule.blockedPictogramIds.length,
      0
    )
  const recognitionGenerationRef = useRef(0)
  const recognitionActivityTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiGenerationRef = useRef(0)
  const aiPendingRef = useRef(false)
  const textAi = useTaroTextAiAvailability()
  const dialectGenerationRef = useRef(0)
  const dialectAudioGenerationRef = useRef(0)
  const imageTextRecognitionIntentIdRef = useRef('')
  const restoredGapsRecordedRef = useRef(false)
  const preparationUpdateRef = useRef(onUpdateDraft)
  preparationUpdateRef.current = onUpdateDraft
  useEffect(() => {
    if (!preparationMode || !activeDraftRef.current) return
    try {
      const saved = preparationUpdateRef.current(activeDraftRef.current, buildReceiverHistoryEntry(session.inputText, session.reviewItems))
      if (!saved) throw new Error('draft unavailable')
      setActiveDraft(saved)
    } catch (_) { setDraftSaveError('准备草稿保存失败，请保留当前页面并重试。') }
  }, [preparationMode, session.inputText, session.reviewItems])
  useEffect(() => {
    if (preparationMode || restoredGapsRecordedRef.current) return
    restoredGapsRecordedRef.current = true
    if (!initialState || initialState.activeDraft?.recordStatus !== 'draft') return
    const tokens = initialState.session.reviewItems
      .filter(item => !item.tile && !missingTokenRecords.some(record => record.normalizedToken === item.token))
      .map(item => item.token)
    if (tokens.length) {
      try { onRecordMissingTokens({ tokens, rawText: initialState.session.inputText, scene: 'receiver' }) }
      catch { /* Keep local review usable if the optional queue cannot persist. */ }
    }
  }, [preparationMode, initialState, missingTokenRecords, onRecordMissingTokens])
  const receiverSignature = [
    session.inputText,
    ...session.reviewItems.map(item =>
      `${item.token}:${item.tile ? item.tile.id : 'missing'}`
    )
  ].join('|')
  const receiverSignatureRef = useRef(receiverSignature)
  receiverSignatureRef.current = receiverSignature
  // Background Care refresh recreates arrays even when the catalog is unchanged.
  // Compare local content so a valid pending comparison survives that refresh;
  // real label, identity, ordering or image changes still invalidate it.
  // This signature stays in memory and is never sent with AI requests.
  const receiverCatalogSignature = JSON.stringify(boards)
  const invalidateTextAi = () => {
    aiGenerationRef.current += 1
    aiPendingRef.current = false
    setIsAiResegmenting(false)
    setPendingAiSuggestion(null)
    wechatSpeechPort.stop()
  }
  useDidHide(() => { invalidateTextAi(); assistanceRef.current = null; setAssistanceRequest(null) })
  useEffect(() => {
    invalidateTextAi()
    assistanceRef.current = null
    setAssistanceRequest(null)
  }, [textAi.contextKey])

  useEffect(
    () => () => {
      recognitionGenerationRef.current += 1
      aiGenerationRef.current += 1
      dialectGenerationRef.current += 1
      dialectAudioGenerationRef.current += 1
      if (recognitionActivityTimerRef.current) {
        clearTimeout(recognitionActivityTimerRef.current)
        recognitionActivityTimerRef.current = null
      }
      wechatRecognitionPort.cancel()
      wechatSpeechPort.stop()
      taroDialectAudioRecognitionPort.cancel()
    },
    []
  )

  useEffect(() => {
    aiGenerationRef.current += 1
    aiPendingRef.current = false
    setIsAiResegmenting(false)
    setPendingAiSuggestion(null)
  }, [receiverSignature, receiverCatalogSignature, segmentationDraft])

  useEffect(() => {
    if (
      !imageTextRecognitionIntent ||
      imageTextRecognitionIntentIdRef.current ===
        imageTextRecognitionIntent.id
    ) {
      return
    }

    imageTextRecognitionIntentIdRef.current =
      imageTextRecognitionIntent.id
    recognitionGenerationRef.current += 1
    wechatRecognitionPort.cancel()
    dialectAudioGenerationRef.current += 1
    taroDialectAudioRecognitionPort.cancel()
    if (recognitionActivityTimerRef.current) {
      clearTimeout(recognitionActivityTimerRef.current)
      recognitionActivityTimerRef.current = null
    }
    setIsRecognitionActivityVisible(false)
    setIsListening(false)
    setDialectSourceText('')
    setIsDialectNormalizing(false)
    setDialectAudioConsent(false)
    setDialectAudioPhase('idle')
    const next = createReceiverWorkspaceFromRecognizedText(
      imageTextRecognitionIntent.text
    )
    setSession(next.session)
    setSegmentationDraft(next.segmentationDraft)
    setActiveDraft(null)
    setReplacementItemId(null)
    setInsertionAfterItemId(null)
    setNotice(next.notice)
  }, [imageTextRecognitionIntent])

  useEffect(() => {
    const refreshed = refreshReceiverMissingItems(
      session,
      boards,
      missingTokenRecords,
      correctionMemory
    )

    if (refreshed === session) return

    setSession(refreshed)
    setSegmentationDraft(formatReceiverSegmentation(refreshed.segments))
    setNotice('已应用照护者确认的缺词图片，可以继续展示。')
  }, [boards, correctionMemory, missingTokenRecords, session])

  const activeBoard = getActiveNavigationBoard(boards, boardNavigation)
  const replacementTiles = getVisibleBoardTiles(boards, boardNavigation)
  const receiverCatalog = getReceiverReplacementCatalog(boards)
  const replacementCatalogById = new Map(
    receiverCatalog.map(candidate => [
      candidate.id,
      candidate
    ])
  )
  const recognitionAvailable = wechatRecognitionPort.available

  const closePictogramPicker = () => {
    setReplacementItemId(null)
    setInsertionAfterItemId(null)
  }

  const persistInputDraft = (text: string) => {
    wechatSpeechPort.stop()
    if (repairRequested) setRepairEditing(true)
    try {
      if (!text.trim() && !preparationMode) {
        if (activeDraft) onDiscardResumableRecord(activeDraft.id, { expected: activeDraft })
        setActiveDraft(null)
        return
      }
      const entry = withReceiverRepair(buildReceiverHistoryEntry(text, []), repairSource)
      const saved = activeDraft?.recordStatus === 'draft'
        ? onUpdateDraft(activeDraft, entry) : onCreateDraft(entry)
      if (!saved) throw new Error('draft unavailable')
      setActiveDraft(saved)
    } catch (_) {
      setDraftSaveError('本机草稿保存失败，请保留当前页面并重试。')
    }
  }

  const clearRecognitionActivity = () => {
    if (recognitionActivityTimerRef.current) {
      clearTimeout(recognitionActivityTimerRef.current)
      recognitionActivityTimerRef.current = null
    }
    setIsRecognitionActivityVisible(false)
  }

  const markRecognitionActivity = () => {
    if (recognitionActivityTimerRef.current) {
      clearTimeout(recognitionActivityTimerRef.current)
    }
    setIsRecognitionActivityVisible(true)
    recognitionActivityTimerRef.current = setTimeout(() => {
      recognitionActivityTimerRef.current = null
      setIsRecognitionActivityVisible(false)
    }, RECOGNITION_ACTIVITY_HOLD_MS)
  }

  const handleMatchForText = (inputText: string) => {
    const nextSession = runReceiverSession(inputText, boards, {
      missingTokenRecords,
      correctionMemory
    })
    setSession(nextSession)
    setSegmentationDraft(formatReceiverSegmentation(nextSession.segments))
    closePictogramPicker()

    const missingTokens = nextSession.reviewItems
      .filter(item => !item.tile && !item.personalReference)
      .map(item => item.token)

    if (missingTokens.length) {
      try {
        onRecordMissingTokens({
          tokens: missingTokens,
          rawText: nextSession.inputText,
          scene: 'receiver'
        })
      } catch (error) {
        // Vocabulary-gap evidence must not block receiver review.
      }
    }

    if (nextSession.matched) {
      try {
        const entry = withReceiverRepair(buildReceiverHistoryEntry(nextSession.inputText, nextSession.reviewItems), repairSource)
        const current = activeDraftRef.current
        setActiveDraft(current?.recordStatus === 'draft' ? onUpdateDraft(current, entry) : onCreateDraft(entry))
      } catch (error) {
        setDraftSaveError('本机草稿保存失败，请保留当前页面并重试。')
      }
    }

    if (!nextSession.reviewItems.length) {
      setNotice('请输入有效文字。')
    } else if (nextSession.quality.needsReview) {
      setNotice('有词语需要确认，请换图或删除后再展示。')
    } else {
      setNotice('图片序列已生成，可以确认保存或全屏展示。')
    }
  }

  const handleVoiceInput = () => {
    if (preparationMode) return
    if (isListening) {
      clearRecognitionActivity()
      setNotice('正在结束录音并识别，请稍候。')
      wechatRecognitionPort.stop()
      return
    }

    const requestGeneration = recognitionGenerationRef.current + 1
    recognitionGenerationRef.current = requestGeneration
    clearRecognitionActivity()
    setIsListening(true)
    setSession(createEmptyReceiverSession())
    setDialectSourceText('')
    setSegmentationDraft('')
    setActiveDraft(null)
    closePictogramPicker()
    setNotice('正在听，请说出需要转换的话。')

    void wechatRecognitionPort
      .start(interimText => {
        if (recognitionGenerationRef.current !== requestGeneration) return
        markRecognitionActivity()
        setSession(current => updateReceiverInput(current, interimText))
        setNotice(
          interimText
            ? '正在识别：' + interimText
            : '正在听，请继续说话。'
        )
      })
      .then(result => {
        if (recognitionGenerationRef.current !== requestGeneration) return
        clearRecognitionActivity()
        setIsListening(false)

        if (!result.ok) {
          setNotice(result.message)
          return
        }

        if (isCantoneseMode) {
          setSession(
            updateReceiverInput(createEmptyReceiverSession(), result.text)
          )
          setDialectSourceText(result.text)
          setSegmentationDraft('')
          setNotice(
            '粤语识别原文已填入。现有微信语音插件不保证粤语准确，请先人工修改或转图卡词，再手动生成图片。'
          )
          return
        }

        handleMatchForText(result.text)
      })
  }

  const handleDialectAudioRecognition = () => {
    if (preparationMode) return
    if (dialectAudioPhase === 'recording') {
      setDialectAudioPhase('recognizing')
      setNotice('正在结束粤语录音并上传识别，请稍候。')
      taroDialectAudioRecognitionPort.stop()
      return
    }
    if (dialectAudioPhase === 'recognizing') return
    if (!dialectAudioConsent) {
      setNotice(
        '请先同意本次录音发送到服务端和外部语音提供方。'
      )
      return
    }

    recognitionGenerationRef.current += 1
    wechatRecognitionPort.cancel()
    clearRecognitionActivity()
    setIsListening(false)
    dialectGenerationRef.current += 1
    setIsDialectNormalizing(false)
    const generation = dialectAudioGenerationRef.current + 1
    dialectAudioGenerationRef.current = generation
    setDialectAudioPhase('recording')
    setNotice('正在录制粤语，完成后点击“结束并识别”。')

    void taroDialectAudioRecognitionPort
      .start({ consent: true })
      .then(result => {
        if (dialectAudioGenerationRef.current !== generation) return
        setDialectAudioPhase('idle')
        setDialectAudioConsent(false)
        if (!result.ok || !result.value) {
          setNotice(result.message)
          return
        }

        setSession(
          updateReceiverInput(
            createEmptyReceiverSession(),
            result.value.text
          )
        )
        setDialectSourceText(result.value.text)
        setSegmentationDraft('')
        setActiveDraft(null)
        closePictogramPicker()
        setNotice(
          '粤语识别原文已填入，请先人工修改或转图卡词，再手动生成图片。'
        )
      })
      .catch(() => {
        if (dialectAudioGenerationRef.current !== generation) return
        setDialectAudioPhase('idle')
        setDialectAudioConsent(false)
        setNotice('粤语录音识别暂时不可用，请继续手工输入。')
      })
  }

  const handleDialectNormalization = async () => {
    const localResult = buildLocalDialectNormalization(
      session.inputText,
      'cantonese'
    )
    if (!localResult) {
      setNotice('请输入需要转换的粤语文字。')
      return
    }

    const request = buildDialectNormalizationRequest({
      text: localResult.sourceText,
      dialect: 'cantonese',
      pictogramVocabulary: receiverCatalog.flatMap(candidate => [
        candidate.displayLabel,
        ...candidate.labels,
        ...candidate.synonyms
      ])
    })
    const generation = dialectGenerationRef.current + 1
    dialectGenerationRef.current = generation
    setIsDialectNormalizing(true)
    setNotice('正在生成普通话图卡词草稿，原识别文字会保留。')

    const onlineResult = await taroCommunicationAiPort.normalizeDialect({
      text: request.text,
      dialect: 'cantonese',
      pictogramVocabulary: request.pictogramVocabulary
    })
    if (dialectGenerationRef.current !== generation) return

    setIsDialectNormalizing(false)
    const result =
      onlineResult.ok && onlineResult.value
        ? onlineResult.value
        : localResult
    setDialectSourceText(result.sourceText)

    if (!result.changed) {
      setNotice(
        onlineResult.ok
          ? '服务端认为无需转换，请直接人工确认原文。'
          : '网络增强不可用，本地词典也没有发现可安全转换的词，请人工修改。'
      )
      return
    }

    setSession(
      updateReceiverInput(
        createEmptyReceiverSession(),
        result.normalizedText
      )
    )
    setSegmentationDraft('')
    setActiveDraft(null)
    closePictogramPicker()
    setNotice(
      onlineResult.ok
        ? '已生成可编辑的普通话图卡词草稿，请确认后再生成图片。'
        : '网络增强不可用，已用本地高置信词典生成可编辑草稿。'
    )
  }

  const handleOpenDisplay = (displaySession = session, assisted = false) => {
    if (displayOpeningRef.current) return
    if (!preparationMode && !assisted && buildReceiverMeaningAssessment(displaySession.inputText, displaySession.reviewItems).requiresAssistance) {
      assistanceRef.current = meaningKey
      setAssistanceRequest(meaningKey)
      wechatSpeechPort.stop()
      return
    }
    if (displaySession.quality.needsReview && !assisted) {
      setNotice('请先处理标记为未匹配或低置信度的词语。')
      return
    }

    const rawHistoryEntry = buildConfirmedReceiverHistory(displaySession)
    if (!rawHistoryEntry) {
      setNotice('请先生成至少一张图片。')
      return
    }
    const historyEntry = withReceiverRepair(rawHistoryEntry, repairSource)

    displayOpeningRef.current = true
    if (preparationMode) {
      try { onConfirmPreparedPhrase?.(historyEntry) }
      finally { displayOpeningRef.current = false }
      return
    }
    let saved = false
    let confirmedRecord: ReceiverDraftEntry | null = null
    try {
      const currentDraft = activeDraftRef.current
      if (currentDraft && currentDraft.recordStatus === 'draft') {
        const confirmed = onConfirmDraft(currentDraft, historyEntry)
        saved = Boolean(confirmed)
        if (confirmed) {
          confirmedRecord = confirmed
          setActiveDraft(confirmed)
        }
      } else if (currentDraft && currentDraft.recordStatus === 'confirmed') {
        saved = true
        confirmedRecord = currentDraft
      } else {
        saved = onConfirm(historyEntry)
      }
    } catch (error) {
      saved = false
    }

    if (!saved) {
      displayOpeningRef.current = false
      setDraftSaveError('确认记录尚未保存，请重试；原内容仍保留。')
      return
    }
    const nextNotice = '已保存确认记录；是否理解请由对方反馈。'
    setNotice(nextNotice)
    onOpenDisplay(
      displaySession.outputPreview,
      displaySession.inputText,
      confirmedRecord ? confirmedRecord.id : '',
      createReceiverWorkspaceResumeState({
        session: displaySession,
        segmentationDraft,
        activeDraft: confirmedRecord || activeDraft,
        learnFromCorrections,
        notice: nextNotice,
        repairRequested, repairSource, repairEditing
      }),
      assisted ? { autoPlay: false } : undefined
    )
  }

  const cancelAssistance = () => { assistanceRef.current = null; setAssistanceRequest(null) }
  const confirmAssistance = () => {
    if (assistanceRef.current !== meaningKeyRef.current || displayOpeningRef.current) return
    const next = replaceReceiverReviewItems(session, prepareReceiverAssistedItems(session.reviewItems))
    try {
      const entry = withReceiverRepair(buildReceiverHistoryEntry(next.inputText, next.reviewItems), repairSource)
      const current = activeDraftRef.current
      // Reopening unchanged, confirmed content is a display action, not a new
      // repair. Compare the ordered snapshots, including concrete identities.
      const sameConfirmed = current?.recordStatus === 'confirmed' &&
        (current.repairOfRecordId || '') === (entry.repairOfRecordId || '') &&
        receiverDraftContentSignature(current) === receiverDraftContentSignature(entry)
      const saved = sameConfirmed ? current : current?.recordStatus === 'draft'
        ? onUpdateDraft(current, entry) : onCreateDraft(entry)
      if (!saved) throw new Error('draft unavailable')
      setActiveDraft(saved)
      setSession(next)
      cancelAssistance()
      handleOpenDisplay(next, true)
    } catch (_) { setDraftSaveError('辅助展示草稿未保存，请重试；原内容仍保留。') }
  }

  const startRepair = (kind: 'text' | 'pictures') => {
    if (!repairSource) return
    wechatSpeechPort.stop()
    const current = activeDraftRef.current
    if (current?.recordStatus !== 'draft' || current.repairOfRecordId !== repairSource.id) {
      try {
        const draft = onCreateDraft(withReceiverRepair(buildReceiverHistoryEntry(session.inputText, session.reviewItems), repairSource))
        if (!draft) throw new Error('draft unavailable')
        setActiveDraft(draft)
      } catch (_) { setNotice('修复草稿未保存，原记录仍保留，请检查本机存储后重试。'); return }
    }
    aiGenerationRef.current += 1
    setIsAiResegmenting(false)
    setPendingAiSuggestion(null)
    setRepairEditing(true)
    aiPendingRef.current = false
    setNotice(kind === 'text' ? '请在下方手动改说，一次说一个意思；修改后重新确认。' : '请使用下方已有换图、补图和排序功能，修改后重新确认。')
  }
  const cancelRepair = () => {
    if (!repairSource) return
    const restored = restoreReceiverWorkspaceFromRecord(repairSource, boards)
    if (!restored) return
    try {
      const current = activeDraftRef.current
      if (current?.recordStatus === 'draft' && !onDiscardResumableRecord(current.id, { expected: current })) throw new Error('discard failed')
    } catch (_) { setNotice('取消未保存，请重试；原记录仍保留。'); return }
    aiGenerationRef.current += 1
    recognitionGenerationRef.current += 1
    dialectGenerationRef.current += 1
    dialectAudioGenerationRef.current += 1
    aiPendingRef.current = false
    wechatRecognitionPort.cancel()
    taroDialectAudioRecognitionPort.cancel()
    clearRecognitionActivity()
    setIsListening(false)
    setIsDialectNormalizing(false)
    setDialectAudioPhase('idle')
    setPendingAiSuggestion(null)
    setIsAiResegmenting(false)
    wechatSpeechPort.stop()
    setSession(restored.session)
    setSegmentationDraft(restored.segmentationDraft)
    setActiveDraft(repairSource)
    setRepairEditing(false)
    closePictogramPicker()
    setNotice('已取消本次修改，原句和原图片仍保留。')
  }
  const reopenRepairOriginal = () => {
    if (!repairSource || repairEditing || displayOpeningRef.current) return
    const restored = restoreReceiverWorkspaceFromRecord(repairSource, boards)
    if (!restored) return
    displayOpeningRef.current = true
    onOpenDisplay(restored.session.outputPreview, repairSource.inputText, repairSource.id,
      { ...restored, repairRequested: true, repairSource, repairEditing: false },
      { startSegmented: true, autoPlay: false })
  }

  const persistReceiverEdit = (
    action: string,
    itemId: string,
    nextSession: typeof session,
    holdOnFailure = false,
    learn = learnFromCorrections
  ) => {
    if (repairRequested) setRepairEditing(true)
    if (action === RECEIVER_CORRECTION_ACTIONS.resegment) {
      closePictogramPicker()
    }
    if (!holdOnFailure) setSession(nextSession)
    if (!holdOnFailure) setSegmentationDraft(formatReceiverSegmentation(nextSession.segments))

    let draft = activeDraftRef.current
    if (!draft || draft.recordStatus !== 'draft') {
      try {
        draft = onCreateDraft(
          withReceiverRepair(buildReceiverHistoryEntry(session.inputText, session.reviewItems), repairSource)
        )
        setActiveDraft(draft)
      } catch (error) {
        draft = null
        setDraftSaveError('草稿创建失败，请保留当前页面并重试。')
      }
    }

    if (!draft) {
      return false
    }

    try {
      onRecordCorrection(
        buildReceiverCorrectionFromEdit(
          draft,
          action,
          session.reviewItems,
          nextSession.reviewItems,
          itemId,
          { isUsedForLearning: learn }
        )
      )
    } catch (error) {
      // Maintenance logging must not block the caregiver's correction.
    }

    try {
      const updated = onUpdateDraft(
        draft,
        buildReceiverHistoryEntry(
          nextSession.inputText,
          nextSession.reviewItems
        )
      )
      if (!updated) throw new Error('draft unavailable')
      setActiveDraft(updated)
      if (holdOnFailure) {
        setSession(nextSession)
        setSegmentationDraft(formatReceiverSegmentation(nextSession.segments))
      }
      return true
    } catch (error) {
      setDraftSaveError('图片修改尚未保存，请保留当前页面并重试。')
      return false
    }
  }

  const handleApplySegmentation = () => {
    const tokens = parseReceiverSegmentationInput(segmentationDraft)

    if (!tokens.length) {
      setNotice('请至少保留一个词语。')
      return
    }

    const nextSession = runReceiverSession(session.inputText, boards, {
      preSegmented: tokens,
      missingTokenRecords,
      correctionMemory
    })
    const missingTokens = nextSession.reviewItems
      .filter(item => !item.tile && !item.personalReference)
      .map(item => item.token)

    if (missingTokens.length) {
      try {
        onRecordMissingTokens({
          tokens: missingTokens,
          rawText: nextSession.inputText,
          scene: 'receiver'
        })
      } catch (error) {
        // Vocabulary-gap evidence must not block manual resegmentation.
      }
    }

    persistReceiverEdit(
      RECEIVER_CORRECTION_ACTIONS.resegment,
      'segmentation',
      nextSession
    )
    setNotice(
      nextSession.quality.needsReview
        ? '已按人工分词重新匹配，请继续处理未匹配词。'
        : '已按人工分词重新匹配，可以继续确认。'
    )
  }

  const handleAiResegmentation = async () => {
    if (preparationMode || aiPendingRef.current) return
    const availability = getTaroTextAiAvailability()
    if (!availability.available) { setNotice(availability.message); return }
    const request = buildCommunicationAiResegmentRequest({
      text: session.inputText,
      reviewItems: session.reviewItems,
      boards
    })
    const generation = ++aiGenerationRef.current
    const requestedSignature = receiverSignature
    setPendingAiSuggestion(null)
    aiPendingRef.current = true
    setIsAiResegmenting(true)
    setNotice('正在请求 AI 分词，当前图片序列仍可人工修改。')
    try {
    const result = await taroCommunicationAiPort.resegment(request)
    if (
      generation !== aiGenerationRef.current ||
      availability.contextKey !== getTaroTextAiAvailability().contextKey ||
      requestedSignature !== receiverSignatureRef.current
    ) {
      return
    }

    setIsAiResegmenting(false)
    if (!result.ok || !result.value) {
      setNotice(result.message)
      return
    }

    const applied = applyCommunicationAiResegmentation({
      currentReviewItems: session.reviewItems,
      response: result.value,
      text: session.inputText,
      boards,
      missingTokenRecords,
      correctionMemory
    })
    if (!applied.applied) {
      setNotice('AI 建议未完整保留原文，已保留当前人工可编辑结果。')
      return
    }

    setPendingAiSuggestion({ applied, generation, signature: requestedSignature })
    setNotice('AI 建议已返回，请比较后选择采用；当前结果尚未改变。')
    } catch (_) {
      if (generation === aiGenerationRef.current)
        setNotice('AI 暂时不可用，已保留当前结果。')
    } finally {
      if (generation === aiGenerationRef.current) {
        aiPendingRef.current = false
        setIsAiResegmenting(false)
      }
    }
  }

  const handleAcceptAiSuggestion = () => {
    if (
      !pendingAiSuggestion ||
      pendingAiSuggestion.generation !== aiGenerationRef.current ||
      pendingAiSuggestion.signature !== receiverSignatureRef.current
    ) return
    const { applied } = pendingAiSuggestion

    const nextSession = replaceReceiverReviewItems(
      session,
      applied.reviewItems
    )
    const missingTokens = nextSession.reviewItems
      .filter(item => !item.tile && !item.personalReference)
      .map(item => item.token)
    if (missingTokens.length) {
      try {
        onRecordMissingTokens({
          tokens: missingTokens,
          rawText: nextSession.inputText,
          scene: 'receiver'
        })
      } catch (error) {
        // AI enhancement must not block the local receiver loop.
      }
    }

    persistReceiverEdit(
      RECEIVER_CORRECTION_ACTIONS.resegment,
      'segmentation-ai',
      nextSession
    )
    setPendingAiSuggestion(null)
    setSegmentationDraft(
      formatReceiverSegmentation(applied.segmentation || nextSession.segments)
    )
    setNotice(
      nextSession.quality.needsReview
        ? 'AI 分词已应用，请继续人工确认未匹配词。'
        : 'AI 分词已应用，图片序列可以继续确认。'
    )
  }

  const currentDraftEntry = withReceiverRepair(buildReceiverHistoryEntry(session.inputText, session.reviewItems), repairSource)
  const draftSaved = Boolean(activeDraft && receiverDraftContentSignature(activeDraft) === receiverDraftContentSignature(currentDraftEntry))
  const retryDraftSave = () => {
    try {
      if (!session.inputText.trim() && !preparationMode) {
        if (activeDraftRef.current && !onDiscardResumableRecord(activeDraftRef.current.id, { expected: activeDraftRef.current })) throw new Error('discard failed')
        setActiveDraft(null); return
      }
      const current = activeDraftRef.current
      const saved = current?.recordStatus === 'draft' ? onUpdateDraft(current, currentDraftEntry) : onCreateDraft(currentDraftEntry)
      if (!saved) throw new Error('draft unavailable')
      setActiveDraft(saved)
    } catch (_) { setDraftSaveError('本机草稿保存失败，请保留当前页面并重试。') }
  }
  return (
    <View className='workspace workspace--receiver'>
      <View className='panel receiver-input-panel'>
        <View className='section-heading'>
          <Text className='section-heading__index'>01</Text>
          <View>
            <Text className='section-heading__title'>照护者输入</Text>
            <Text className='section-heading__hint'>把听到或想说的话转换成图片</Text>
          </View>
        </View>

        <View id='receiver-draft-save-status' className='storage-notice'>
          <Text>{externalSaveError || draftSaveError || (draftSaved ? '已保存到本机' : session.inputText ? '当前修改尚未保存到本机' : '')}</Text>
          {(externalSaveError || draftSaveError || (session.inputText && !draftSaved)) && <Button id='receiver-draft-save-retry' onClick={retryDraftSave}>重试保存</Button>}
        </View>
        {preparationMode && <View>
          <Button onClick={() => setShowPartnerGuidance(value => !value)}>
            {showPartnerGuidance ? '收起伙伴提示' : '伙伴提示'}
          </Button>
          {showPartnerGuidance && <Text>{RECEIVER_PARTNER_GUIDANCE}</Text>}
          <Text className='storage-notice'>图片不可用时请重新选择或保留文字；准备草稿仅保存在当前设备。</Text>
        </View>}
        <View hidden={preparationMode} className='dialect-mode-control'>
          <View className='dialect-mode-control__copy'>
            <Text className='dialect-mode-control__title'>
              粤语输入与转图卡词
            </Text>
            <Text className='dialect-mode-control__hint'>
              开启后不会自动匹配；WechatSI 不保证粤语识别，可直接手工输入粤语。
            </Text>
          </View>
          <Switch
            id='receiver-cantonese-mode-switch'
            checked={isCantoneseMode}
            disabled={
              isListening ||
              isDialectNormalizing ||
              dialectAudioPhase !== 'idle'
            }
            color='#287560'
            onChange={event => {
              dialectGenerationRef.current += 1
              dialectAudioGenerationRef.current += 1
              taroDialectAudioRecognitionPort.cancel()
              setIsCantoneseMode(event.detail.value)
              setDialectSourceText('')
              setDialectAudioConsent(false)
              setDialectAudioPhase('idle')
              setNotice(
                event.detail.value
                  ? '粤语模式已开启：先确认原文，再转换或人工修改。'
                  : '已切回普通话输入。'
              )
            }}
          />
        </View>

        {isCantoneseMode && (
          <View className='dialect-audio-consent'>
            <View className='dialect-audio-consent__copy'>
              <Text className='dialect-audio-consent__title'>
                服务端粤语录音识别
              </Text>
              <Text className='dialect-audio-consent__hint'>
                录音会发送到 CBoard API 及其配置的外部语音提供方；
                CBoard 不保存录音，每次录音前都需单独同意。
              </Text>
            </View>
            <Switch
              id='receiver-dialect-audio-consent-switch'
              checked={dialectAudioConsent}
              disabled={
                isListening ||
                isDialectNormalizing ||
                dialectAudioPhase !== 'idle'
              }
              color='#9a5b20'
              onChange={event => {
                setDialectAudioConsent(event.detail.value)
                setNotice(
                  event.detail.value
                    ? '已同意本次粤语录音处理，可以开始录音。'
                    : '已取消本次粤语录音处理同意。'
                )
              }}
            />
          </View>
        )}

        {repairRequested && <View className='receiver-repair' id='receiver-repair'>
          <Text className='section-title'>换一种方式说明</Text>
          <Text>{repairSource ? `原句：${repairSource.inputText}` : '原记录不可用；当前草稿仍可继续编辑和确认。'}</Text>
          <Button onClick={() => setShowPartnerGuidance(value => !value)}>{showPartnerGuidance ? '收起伙伴提示' : '伙伴提示'}</Button>
          {showPartnerGuidance && <Text>{RECEIVER_PARTNER_GUIDANCE}</Text>}
          <View className='action-row'>
            <PatientActionButton action={PATIENT_ACTION_IDS.replay} id='receiver-repair-repeat' label='再听原句' ariaLabel='再听原句'
              disabled={!repairSource} onClick={() => { wechatSpeechPort.stop(); if (repairSource) void wechatSpeechPort.speak(repairSource.inputText) }}
            />
            <PatientActionButton action={PATIENT_ACTION_IDS.fullscreen} id='receiver-repair-segments' label='一段一段看' ariaLabel='重新展示原记录，不新增历史'
              disabled={!repairSource || repairEditing} onClick={reopenRepairOriginal}
            />
            <Button id='receiver-repair-text' disabled={!repairSource} onClick={() => startRepair('text')}>我换个说法</Button>
            <Button id='receiver-repair-pictures' disabled={!repairSource} onClick={() => startRepair('pictures')}>调整图片</Button>
            {repairEditing && repairSource && <PatientActionButton action={PATIENT_ACTION_IDS.undo} id='receiver-repair-cancel'
              label='取消修改' ariaLabel='取消修改并返回原记录' onClick={cancelRepair}
            />}
          </View>
        </View>}
        <Textarea
          id='receiver-input'
          className='receiver-textarea'
          value={session.inputText}
          disabled={isListening || dialectAudioPhase !== 'idle'}
          maxlength={80}
          placeholder='例如：想喝水'
          onInput={event => {
            if (isListening || dialectAudioPhase !== 'idle') return
            dialectGenerationRef.current += 1
            setSession(updateReceiverInput(session, event.detail.value))
            setSegmentationDraft('')
            closePictogramPicker()
            setNotice(
              isCantoneseMode
                ? '粤语原文已更新，请转换或人工修改后再生成图片。'
                : '文字已更新，请重新生成图片序列。'
            )
            persistInputDraft(event.detail.value)
          }}
        />

        <View className='example-list'>
          {RECEIVER_EXAMPLES.map((example, index) => (
            <Button
              id={`receiver-example-${index}`}
              className='example-chip'
              key={example}
              disabled={isListening || dialectAudioPhase !== 'idle'}
              onClick={() => {
                dialectGenerationRef.current += 1
                setSession(updateReceiverInput(session, example))
                setDialectSourceText('')
                setSegmentationDraft('')
                closePictogramPicker()
                setNotice(`已填入「${example}」，请生成图片序列。`)
                persistInputDraft(example)
              }}
            >
              {example}
            </Button>
          ))}
        </View>

        <View className='primary-actions'>
          <Button
            id='receiver-generate-button'
            className='button button--primary'
            disabled={
              !session.inputText.trim() ||
              isListening ||
              dialectAudioPhase !== 'idle'
            }
            onClick={() => handleMatchForText(session.inputText)}
          >
            {preparationMode ? '匹配图片' : '生成图片序列'}
          </Button>
          <Button
            id='receiver-voice-input-button'
            hidden={preparationMode}
            className={
              isListening
                ? 'button button--voice-input button--voice-input-active'
                : 'button button--voice-input'
            }
            disabled={
              dialectAudioPhase !== 'idle' ||
              (!recognitionAvailable && !isListening)
            }
            onClick={handleVoiceInput}
          >
            {isListening ? '结束并转文字' : '语音输入'}
          </Button>
          {isCantoneseMode && (
            <Button
              id='receiver-dialect-audio-button'
              className={
                dialectAudioPhase === 'recording'
                  ? 'button button--dialect-audio button--dialect-audio-active'
                  : 'button button--dialect-audio'
              }
              disabled={
                isListening ||
                isDialectNormalizing ||
                dialectAudioPhase === 'recognizing'
              }
              onClick={handleDialectAudioRecognition}
            >
              {dialectAudioPhase === 'recording'
                ? '结束并识别'
                : dialectAudioPhase === 'recognizing'
                  ? '上传识别中...'
                  : '粤语录音识别'}
            </Button>
          )}
          {isCantoneseMode && (
            <Button
              id='receiver-normalize-dialect-button'
              className='button button--dialect'
              disabled={
                !session.inputText.trim() ||
                isListening ||
                isDialectNormalizing ||
                dialectAudioPhase !== 'idle'
              }
              onClick={handleDialectNormalization}
            >
              {isDialectNormalizing ? '转换中...' : '粤语转图卡词'}
            </Button>
          )}
          {dialectSourceText &&
            dialectSourceText !== session.inputText && (
              <Button
                id='receiver-restore-dialect-source-button'
                className='button button--outline'
                disabled={
                  isListening ||
                  isDialectNormalizing ||
                  dialectAudioPhase !== 'idle'
                }
                onClick={() => {
                  dialectGenerationRef.current += 1
                  setSession(
                    updateReceiverInput(
                      createEmptyReceiverSession(),
                      dialectSourceText
                    )
                  )
                  setSegmentationDraft('')
                  setActiveDraft(null)
                  setNotice(
                    '已恢复粤语原识别文字，请继续人工修改或重新转换。'
                  )
                }}
              >
                恢复原识别文字
              </Button>
            )}
          {onOpenImageTextRecognition && (
            <Button
              id='receiver-image-text-button'
              className='button button--image-text'
              disabled={isListening || dialectAudioPhase !== 'idle'}
              onClick={onOpenImageTextRecognition}
            >
              图片识字
            </Button>
          )}
          <Button
            className='button button--outline'
            onClick={() => {
              if (preparationMode) {
                setSession(createEmptyReceiverSession()); setSegmentationDraft('');
                persistInputDraft(''); closePictogramPicker(); return
              }
              recognitionGenerationRef.current += 1
              dialectGenerationRef.current += 1
              dialectAudioGenerationRef.current += 1
              wechatRecognitionPort.cancel()
              taroDialectAudioRecognitionPort.cancel()
              clearRecognitionActivity()
              if (activeDraft) {
                try {
                  onDiscardResumableRecord(activeDraft.id, { expected: activeDraft })
                } catch (error) {
                  // Clearing the visible workspace must remain available offline.
                }
              }
              setIsListening(false)
              setRepairSource(null)
              setRepairRequested(false)
              setRepairEditing(false)
              setSession(createEmptyReceiverSession())
              setDialectSourceText('')
              setIsDialectNormalizing(false)
              setDialectAudioConsent(false)
              setDialectAudioPhase('idle')
              setSegmentationDraft('')
              setActiveDraft(null)
              closePictogramPicker()
              setNotice('已清空，请重新输入。')
            }}
          >
            重新输入
          </Button>
        </View>

        {isListening && (
          <View
            id='receiver-listening-feedback'
            className={
              isRecognitionActivityVisible
                ? 'listening-feedback listening-feedback--active'
                : 'listening-feedback'
            }
            role='status'
            aria-label={
              isRecognitionActivityVisible
                ? '识别文字已更新'
                : '正在听，等待语音'
            }
          >
            <View className='listening-feedback__state' aria-hidden='true'>
              <View className='listening-feedback__state-dot' />
              <Text className='listening-feedback__state-label'>
                {isRecognitionActivityVisible ? '已更新' : '监听中'}
              </Text>
            </View>
            <View className='listening-feedback__copy'>
              <Text className='listening-feedback__title'>
                {isRecognitionActivityVisible
                  ? '识别文字已更新'
                  : '正在听，等你说话'}
              </Text>
              <Text className='listening-feedback__hint'>
                {isRecognitionActivityVisible
                  ? '上方文字已经更新，结束后仍可人工修改'
                  : '这是监听状态，不是音量波形；静音时不会变化'}
              </Text>
            </View>
          </View>
        )}

        {!recognitionAvailable && (
          <Text className='voice-input-notice'>
            {WECHAT_RECOGNITION_UNAVAILABLE_MESSAGE}
          </Text>
        )}
      </View>

      {session.matched && (
        <View className='panel receiver-review-panel'>
          <View className='section-heading'>
            <Text className='section-heading__index'>02</Text>
            <View>
              <Text className='section-heading__title'>逐词确认</Text>
              <Text className='section-heading__hint'>识别文字和分词都可修改，也可以换图、后加图片、调序或删除</Text>
            </View>
          </View>

          <View className='segmentation-editor'>
            <View className='segmentation-editor__heading'>
              <Text className='segmentation-editor__title'>分词结果（可修改）</Text>
              <Text className='segmentation-editor__hint'>用 / 分开词语；引号内的标点和空白属于原文，请保留。删掉词语之间的分隔符可合并词语。</Text>
            </View>
            <Textarea
              id='receiver-segmentation-input'
              className='segmentation-editor__input'
              value={segmentationDraft}
              maxlength={120}
              placeholder='例如：我 / 想 / 喝 / 水'
              onInput={event => setSegmentationDraft(event.detail.value)}
            />
            <Button
              id='receiver-apply-segmentation-button'
              className='button button--segmentation'
              disabled={!parseReceiverSegmentationInput(segmentationDraft).length}
              onClick={handleApplySegmentation}
            >
              按此分词重新匹配
            </Button>
            <Button
              id='receiver-ai-segmentation-button'
              hidden={preparationMode}
              className='button button--ai'
              disabled={!textAi.available || isAiResegmenting || !session.reviewItems.length}
              onClick={() => void handleAiResegmentation()}
            >
              {isAiResegmenting ? 'AI 分词中' : 'AI 辅助分词'}
            </Button>
            {!preparationMode && !textAi.available && <View id='receiver-text-ai-availability'>
              <Text>{textAi.message}</Text>
              {textAi.action && <Button onClick={() => void openTextAiSetup(textAi.action)}>
                {textAi.action === 'login' ? '前往登录' : '选择档案与额度'}
              </Button>}
            </View>}
            {pendingAiSuggestion && (
              <View id='receiver-ai-suggestion'>
                <Text>原文：{session.inputText}</Text>
                <Text>当前分词：{session.reviewItems.map(item => item.token).join(' / ')}</Text>
                <Text>建议分词：{pendingAiSuggestion.applied.segmentation?.join(' / ')}</Text>
                <Button id='receiver-accept-ai-suggestion' onClick={handleAcceptAiSuggestion}>
                  采用分词建议
                </Button>
                <Button
                  id='receiver-dismiss-ai-suggestion'
                  onClick={() => {
                    setPendingAiSuggestion(null)
                    setNotice('已保留当前结果。')
                  }}
                >
                  保留当前结果
                </Button>
              </View>
            )}
            <View
              className='correction-learning'
              id={correctionMemoryProbeId}
            >
              <View className='correction-learning__copy'>
                <Text className='correction-learning__title'>
                  记住本次人工换图和删除
                </Text>
                <Text className='correction-learning__hint'>
                  只在当前工作区本机生效，不会修改 CBoard 默认词典
                </Text>
              </View>
              <Switch
                id='receiver-correction-learning-switch'
                checked={learnFromCorrections}
                color='#2f6c5a'
                onChange={event =>
                  setLearnFromCorrections(event.detail.value)
                }
              />
            </View>
          </View>
          <View
            className={`quality-banner ${
              session.quality.needsReview || meaning.requiresAssistance
                ? 'quality-banner--review'
                : 'quality-banner--ready'
            }`}
          >
            <Text className='quality-banner__count'>
              图片 {meaning.pictureCount}/{meaning.meaningfulCount}（不含标点；不是理解程度）
            </Text>
            <View>
              <Text className='quality-banner__title'>
                {meaning.requiresAssistance ? '尚需伙伴解释' : '请复核图片，再核对对方理解'}
              </Text>
              <Text className='quality-banner__hint'>
                {[
                  session.quality.textOnlyCount > 0 ? `保留文字 ${session.quality.textOnlyCount} 项` : '',
                  session.quality.missingCount > 0
                    ? `${session.quality.missingCount} 项待处理`
                    : session.quality.textOnlyCount > 0 ? '文字仅供伙伴核对原话' : '已找到图片，不代表对方已经理解'
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          {meaning.requiresAssistance && <View id='receiver-meaning-gaps'>
            <Text>尚需解释：{meaning.unresolvedMeaningItems.map(item => `${item.token}（${item.explanation || item.role}）`).join('、')}</Text>
            <Button onClick={() => { const item = session.reviewItems.find(row => !row.tile || row.tile.textOnly); if (item) setReplacementItemId(item.id) }}>选图或补图</Button>
            <Button onClick={() => { wechatSpeechPort.stop(); if (activeDraftRef.current?.recordStatus === 'confirmed') { setRepairSource(activeDraftRef.current); setRepairRequested(true) } setNotice(`原句参照：${session.inputText}。请在上方手动改说，一次说一个意思。`) }}>我换个说法</Button>
            {!preparationMode && <Button onClick={() => handleOpenDisplay()}>由伙伴辅助展示</Button>}
            <Button onClick={() => setShowPartnerGuidance(!showPartnerGuidance)}>{showPartnerGuidance ? '收起伙伴提示' : '伙伴提示'}</Button>
            {showPartnerGuidance && <Text>{RECEIVER_PARTNER_GUIDANCE}</Text>}
          </View>}
          {assistanceRequest && <View id='receiver-assistance-confirm' role='dialog'>
            <Text>以下意思尚需解释：{meaning.unresolvedMeaningItems.map(item => item.token).join('、')}。保留文字不代表对方已理解。</Text>
            <Text>原句：{session.inputText}</Text>
            {draftSaveError && <Text>{draftSaveError}</Text>}
            <Button onClick={cancelAssistance}>返回复核</Button>
            <Button onClick={confirmAssistance}>我会辅助解释，继续展示</Button>
          </View>}

          <View className='review-list'>
            {session.reviewItems.map((item, index) => (
              <View
                className='review-row'
                key={item.id}
              >
                <View
                  className='review-row__symbol'
                  id={`review-pictogram-${item.tile ? item.tile.id : 'missing'}`}
                >
                  {item.tile?.textOnly ? <Text>{item.token} · {isReceiverPunctuation(item.token) ? '原文标点' : '文字参照，仍需解释'}</Text> : item.tile ? (
                    <PictogramImage localOnly
                      className='review-row__image'
                      src={item.tile.tile.image}
                      label={item.tile.displayLabel || item.token}
                      mediaType={item.tile.tile.mediaType}
                      video={item.tile.tile.video}
                    />
                  ) : (
                    <Text className='review-row__missing'>?</Text>
                  )}
                </View>
                <View className='review-row__copy'>
                  <Text className='review-row__token'>{item.token}</Text>
                  <Text className='review-row__label'>
                    {item.tile ? item.tile.displayLabel : '尚未匹配图片'}
                  </Text>
                  <Text
                    className={`review-row__match review-row__match--${item.matchType}`}
                  >
                    {MATCH_TYPE_LABELS[item.matchType] || item.matchType}
                  </Text>
                </View>
                <View className='review-row__actions'>
                  {!item.personalReference && getLocalPictogramCandidates(item.token, receiverCatalog, getReceiverReplacementCatalog(DEFAULT_BOARD_FIXTURES)).map(candidate => (
                    <Button key={candidate.sourceId} onClick={async () => {
                      if (candidatePendingRef.current) return
                      candidatePendingRef.current = true
                      const key = meaningKeyRef.current, generation = aiGenerationRef.current
                      try {
                        const result = await verifyTaroLocalImage(candidate.item.tile.image)
                        if (key !== meaningKeyRef.current || generation !== aiGenerationRef.current) return
                        if (result.status !== 'available') { setNotice('候选图片尚未核验可用，请重试或使用已有图片修复入口。'); return }
                        persistReceiverEdit(RECEIVER_CORRECTION_ACTIONS.replace, item.id, replaceReceiverItem(session, item.id, candidate.item), true, false)
                      } finally { candidatePendingRef.current = false }
                    }}>
                      <PictogramImage localOnly src={candidate.item.tile.image} label={candidate.item.displayLabel} />
                      {candidate.item.displayLabel} · {({ equivalent: '等义候选', narrower: '更具体', broader: '较宽泛', related: '相关' } as Record<string, string>)[candidate.relation]} · {candidate.hint}
                    </Button>
                  ))}
                  {item.tile && !item.tile.textOnly && <ImageRepairControls
                    tile={item.tile.tile}
                    operationKey={JSON.stringify([activeDraft?.id, session.inputText, index, session.reviewItems])}
                    onChoose={() => { setInsertionAfterItemId(null); setReplacementItemId(item.id) }}
                    onKeepText={() => persistReceiverEdit(RECEIVER_CORRECTION_ACTIONS.replace,
                      item.id, retainReceiverItemAsText(session, item.id))}
                    onAdopt={tile => persistReceiverEdit(RECEIVER_CORRECTION_ACTIONS.replace, item.id,
                      replaceReceiverItem(session, item.id, repairCatalogImage(item.tile!, tile)), true)}
                  />}
                  {!item.tile && item.personCandidates && item.personCandidates.length > 0 && (
                    <View>
                      <Text>同名人物，请选择本人照片：</Text>
                      {item.personCandidates.map(candidate => (
                        <Button key={candidate.id} className='replacement-option'
                          onClick={() => persistReceiverEdit(RECEIVER_CORRECTION_ACTIONS.replace,
                            item.id, replaceReceiverItem(session, item.id, candidate))}
                        >
                          <PictogramImage src={candidate.tile.image} label={candidate.displayLabel} />
                          <Text>{candidate.displayLabel} · {candidate.boardName}</Text>
                        </Button>
                      ))}
                    </View>
                  )}
                  {!item.tile && (
                    <Button
                      className='review-action'
                      id={`receiver-retain-text-${index}`}
                      onClick={() => persistReceiverEdit(
                        RECEIVER_CORRECTION_ACTIONS.replace,
                        item.id,
                        retainReceiverItemAsText(session, item.id)
                      )}
                    >
                      保留文字
                    </Button>
                  )}
                  <Button
                    className='review-action'
                    disabled={index === 0}
                    onClick={() =>
                      persistReceiverEdit(
                        RECEIVER_CORRECTION_ACTIONS.reorder,
                        item.id,
                        moveReceiverItem(session, item.id, -1)
                      )
                    }
                  >
                    左移
                  </Button>
                  <Button
                    className='review-action'
                    disabled={index === session.reviewItems.length - 1}
                    onClick={() =>
                      persistReceiverEdit(
                        RECEIVER_CORRECTION_ACTIONS.reorder,
                        item.id,
                        moveReceiverItem(session, item.id, 1)
                      )
                    }
                  >
                    右移
                  </Button>
                  <Button
                    className='review-action review-action--swap'
                    onClick={() => {
                      setInsertionAfterItemId(null)
                      setReplacementItemId(item.id)
                    }}
                  >
                    换图
                  </Button>
                  <Button
                    className='review-action review-action--insert'
                    onClick={() => {
                      setReplacementItemId(null)
                      setInsertionAfterItemId(item.id)
                    }}
                  >
                    后加图片
                  </Button>
                  <Button
                    className='review-action review-action--delete'
                    onClick={() => {
                      persistReceiverEdit(
                        RECEIVER_CORRECTION_ACTIONS.delete,
                        item.id,
                        deleteReceiverItem(session, item.id)
                      )
                      if (replacementItemId === item.id) {
                        setReplacementItemId(null)
                      }
                      if (insertionAfterItemId === item.id) {
                        setInsertionAfterItemId(null)
                      }
                    }}
                  >
                    删除
                  </Button>
                </View>
              </View>
            ))}
          </View>

          {(replacementItemId || insertionAfterItemId) && (
            <View className='replacement-panel'>
              <View className='replacement-panel__heading'>
                <View>
                  <Text className='replacement-panel__title'>
                    {insertionAfterItemId ? '选择要添加的图片' : '选择正确图片'}
                  </Text>
                  <Text className='replacement-panel__hint'>{activeBoard ? activeBoard.name : 'CBoard 默认板'} · 点分类进入子板</Text>
                </View>
                <Button
                  className='replacement-panel__close'
                  onClick={closePictogramPicker}
                >
                  关闭
                </Button>
              </View>
              <BoardNavigator
                boards={boards}
                state={boardNavigation}
                onChange={setBoardNavigation}
              />
              <View className='replacement-grid'>
                {replacementTiles.map(tile => {
                  const candidate = replacementCatalogById.get(tile.id)

                  if (isNavigationTile(tile)) {
                    return (
                      <Button
                        id={`replacement-option-${tile.id}`}
                        className='replacement-option replacement-option--folder'
                        key={getBoardTileKey(tile)}
                        style={{ backgroundColor: tile.backgroundColor }}
                        onClick={() =>
                          setBoardNavigation(
                            openNavigationTile(boards, boardNavigation, tile)
                          )
                        }
                      >
                        <Text className='replacement-option__folder-badge'>进入</Text>
                        <PictogramImage
                          className='replacement-option__image'
                          src={tile.image}
                          label={tile.label}
                          mediaType={tile.mediaType}
                          video={tile.video}
                        />
                        <Text className='replacement-option__label'>
                          {tile.label}
                        </Text>
                      </Button>
                    )
                  }

                  if (!candidate) {
                    return null
                  }

                  return (
                    <Button
                      id={`replacement-option-${tile.id}`}
                      className='replacement-option'
                      key={getBoardTileKey(tile)}
                      style={{ backgroundColor: tile.backgroundColor }}
                      onClick={() => {
                        if (insertionAfterItemId) {
                          const insertedItemId = createReceiverItemId()
                          persistReceiverEdit(
                            RECEIVER_CORRECTION_ACTIONS.insert,
                            insertedItemId,
                            insertReceiverItem(
                              session,
                              insertionAfterItemId,
                              candidate,
                              insertedItemId
                            )
                          )
                          setNotice(`已在后方添加「${candidate.displayLabel}」。`)
                        } else if (replacementItemId) {
                          persistReceiverEdit(
                            RECEIVER_CORRECTION_ACTIONS.replace,
                            replacementItemId,
                            replaceReceiverItem(
                              session,
                              replacementItemId,
                              candidate
                            )
                          )
                          setNotice(`已改为「${candidate.displayLabel}」。`)
                        }
                        closePictogramPicker()
                      }}
                    >
                      <PictogramImage
                        className='replacement-option__image'
                        src={candidate.tile.image}
                        label={candidate.displayLabel}
                        mediaType={candidate.tile.mediaType}
                        video={candidate.tile.video}
                      />
                      <Text className='replacement-option__label'>
                        {candidate.displayLabel}
                      </Text>
                    </Button>
                  )
                })}
              </View>
            </View>
          )}
        </View>
      )}

      {session.matched && (
        <View className='panel receiver-output-panel'>
          <View className='section-heading'>
            <Text className='section-heading__index'>03</Text>
            <View>
              <Text className='section-heading__title'>确认图片序列</Text>
              <Text className='section-heading__hint'>确认后再展示给沟通对象</Text>
            </View>
          </View>

          <View className='receiver-preview'>
            {session.outputPreview.length ? (
              session.outputPreview.map((item, index) => (
                <View className='receiver-preview__item' key={`${item.id}-${index}`}>
                  {item.textOnly ? <Text>{isReceiverPunctuation(item.label) ? '原文标点' : '文字参照，尚未图示'}</Text> : <PictogramImage localOnly
                    className='receiver-preview__image'
                    src={item.image}
                    label={item.label}
                    mediaType={item.mediaType}
                    video={item.video}
                    videoAutoplay={item.mediaType === 'video'}
                  />}
                  <Text className='receiver-preview__label'>{item.label}</Text>
                </View>
              ))
            ) : (
              <Text className='receiver-preview__empty'>还没有可展示的图片。</Text>
            )}
          </View>

          <View className='primary-actions'>
            {preparationMode && <Text>待收藏完整句子：{session.inputText}</Text>}
            <PatientActionButton
              action={preparationMode ? PATIENT_ACTION_IDS.save : PATIENT_ACTION_IDS.fullscreen}
              id='receiver-open-display-button'
              className='button button--primary'
              disabled={preparationMode ? !session.outputPreview.length || session.quality.needsReview : !session.reviewItems.length}
              onClick={() => handleOpenDisplay()}
              label={preparationMode ? preparationSaveLabel : '全屏'}
              ariaLabel={preparationMode ? preparationSaveLabel : '全屏展示并保存已确认图片'}
            />
          </View>
          <Text className='storage-notice'>{notice}</Text>
        </View>
      )}

      <MissingTokenQueue
        boards={boards}
        records={missingTokenRecords}
        onlineSearchEnabled={onlineSearchEnabled}
        onlineSearchAvailable={onlineSearchAvailable}
        onReview={onReviewMissingToken}
        onSearchOnline={onSearchMissingTokensOnline}
        onAcceptOnline={onAcceptMissingTokenOnline}
      />

      {!session.matched && <Text className='storage-notice receiver-idle-notice'>{notice}</Text>}
    </View>
  )
}

