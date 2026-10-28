import type { Dispatch } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { getBoardDTOGridSlots } from '@cboard-communication-core/dto'
import {
  CANDIDATE_FEEDBACK,
  normalizeExpressionCandidates,
  toggleExpressionCandidateFeedback,
  type ExpressionCandidate,
  type ExpressionCandidateFeedbackDraft
} from '@cboard-communication-core/candidateFeedback'
import {
  createCandidateAutoplayController,
  type CandidateAutoplayController
} from '@cboard-communication-core/candidateAutoplay'
import {
  applyCommunicationAiSentenceResponse,
  buildCommunicationAiSentenceRequest
} from '@cboard-communication-core/communicationAi'
import {
  attachExpressionDraftRequest,
  type ExpressionDraftSnapshot,
  type ExpressionDraftService
} from '@cboard-communication-core/expressionDraft'
import type {
  ConversationContext
} from '@cboard-communication-core/conversationSession'
import type {
  CommunicationCandidateAutoplayDelay,
  CommunicationPictogramSortMode
} from '@cboard-communication-core/communicationPreferences'
import {
  buildExpressionHistoryEntry,
  buildExpressionSavedPhraseEntry,
  getSelectedExpressionSentence,
  persistExpressionHistoryEntry,
  type ExpressionHistoryEntry,
  type ExpressionSavedPhraseEntry
} from '@cboard-communication-core/expressionPipeline'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type {
  CommunicationHistoryEntry,
  CommunicationSavedPhraseEntry
} from '@cboard-communication-core/repository'
import {
  sortPictogramsForDisplay,
  type PictogramOrderingState
} from '@cboard-communication-core/pictogramOrdering'
import {
  buildExpressionPictogramSuggestions,
  PICTOGRAM_SUGGESTION_MODES
} from '@cboard-communication-core/pictogramSuggestions'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'

import { taroCommunicationAiPort } from '../../platform/taroCommunicationAiPort'
import { getTaroTextAiAvailability, openTextAiSetup, useTaroTextAiAvailability } from '../../platform/taroTextAiAvailability'
import { taroCommunicationSharePort } from '../../platform/taroCommunicationSharePort'
import {
  wechatSpeechPort,
  wechatTileAudioPort
} from '../../platform/taroSpeechPort'
import BoardNavigator from './BoardNavigator'
import PatientActionButton from './PatientActionButton'
import PictogramImage from '../../components/PictogramImage'
import ImageRepairControls from '../../components/ImageRepairControls'
import PhrasePlaybackOverlay from './PhrasePlaybackOverlay'
import SavedPhrasesPanel from './SavedPhrasesPanel'
import {
  createBoardNavigationState,
  getActiveNavigationBoard,
  getBoardTileKey,
  getVisibleBoardTiles,
  isNavigationTile,
  openNavigationTile
} from './boardNavigation'
import {
  MAX_EXPRESSION_TILES,
  type ExpressionSessionAction,
  type ExpressionSessionState
} from './session'
import {
  playExpressionSentence,
  stopExpressionPlayback
} from './expressionPlaybackCoordinator'

interface ExpressionWorkspaceProps {
  boards: BoardDTO[]
  session: ExpressionSessionState
  dispatch: Dispatch<ExpressionSessionAction>
  savedPhrases: CommunicationSavedPhraseEntry[]
  conversationContext: ConversationContext
  candidateFeedbackSyncAvailable: boolean
  initialCandidateFeedbackDraft: ExpressionCandidateFeedbackDraft | null
  initialExpressionDraft?: ExpressionDraftSnapshot | null
  draftService?: ExpressionDraftService
  speechRate: number
  candidateAutoplayDelaySeconds: CommunicationCandidateAutoplayDelay
  pictogramSortMode: CommunicationPictogramSortMode
  pictogramOrdering: PictogramOrderingState
  onConfirm: (
    entry: ExpressionHistoryEntry
  ) => CommunicationHistoryEntry | null
  onSaveCandidateFeedbackDraft: (entry: {
    id?: string
    outputSignature: string
    candidates: ExpressionCandidate[]
    rejected?: boolean
  }) => ExpressionCandidateFeedbackDraft | null
  onDiscardCandidateFeedbackDraft: (id: string) => boolean
  onSavePhrase: (entry: ExpressionSavedPhraseEntry) => boolean
  onReusePhrase: (entry: CommunicationSavedPhraseEntry) => boolean
  onUseSavedPhrase: (entry: CommunicationSavedPhraseEntry) => void
  onPictogramUsed: (boardId: string, tileId: string) => void
}

export default function ExpressionWorkspace({
  boards,
  session,
  dispatch,
  savedPhrases,
  conversationContext,
  candidateFeedbackSyncAvailable,
  initialCandidateFeedbackDraft,
  initialExpressionDraft,
  draftService,
  speechRate,
  candidateAutoplayDelaySeconds,
  pictogramSortMode,
  pictogramOrdering,
  onConfirm,
  onSaveCandidateFeedbackDraft,
  onDiscardCandidateFeedbackDraft,
  onSavePhrase,
  onReusePhrase,
  onUseSavedPhrase,
  onPictogramUsed
}: ExpressionWorkspaceProps) {
  const [boardNavigation, setBoardNavigation] = useState(() =>
    createBoardNavigationState(boards)
  )
  const [notice, setNotice] = useState(
    session.restored
      ? '已恢复上次表达。请主动选择或播报，恢复不会启动旧倒计时。'
      : '选择图片开始表达。'
  )
  const [isSpeaking, setIsSpeaking] = useState(false)
  const savedPlaybackCounted = useRef(false)
  const savedPlaybackPending = useRef(false)
  const [pendingAutoplayDelayMs, setPendingAutoplayDelayMs] = useState(0)
  const [playbackPhrase, setPlaybackPhrase] =
    useState<CommunicationSavedPhraseEntry | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [aiCompletion, setAiCompletion] = useState(0)
  const [candidateFeedbackEntries, setCandidateFeedbackEntries] = useState(
    () =>
      normalizeExpressionCandidates(
        initialExpressionDraft
          ? initialExpressionDraft.candidateFeedbackEntries
          : initialCandidateFeedbackDraft
          ? initialCandidateFeedbackDraft.candidates
          : [],
        session.pipeline.candidateSentences
      )
  )
  const [candidateFeedbackNotice, setCandidateFeedbackNotice] = useState('')
  const [candidatesRejected, setCandidatesRejected] = useState(Boolean(
    initialExpressionDraft ? initialExpressionDraft.rejected : initialCandidateFeedbackDraft?.rejected
  ))
  const candidatesRejectedRef = useRef(candidatesRejected)
  const rejectionSelectionRef = useRef(session.pipeline.outputSignature)
  const feedbackInputRef = useRef(initialCandidateFeedbackDraft)
  feedbackInputRef.current = initialCandidateFeedbackDraft
  const [isExpressionConfirmed, setIsExpressionConfirmed] = useState(false)
  const restorationMutedRef = useRef(Boolean(session.restored || initialExpressionDraft))
  // Opening a blank workspace after confirmation is not a new user edit.
  // Keep the confirmed record association until content actually changes.
  const settledEntrySignature = useRef(
    draftService?.getCurrent()?.status === 'confirmed' &&
    !session.pipeline.outputSnapshot.length && !session.pipeline.candidateSentences.length
      ? JSON.stringify({ pipeline: session.pipeline, rejected: candidatesRejected, candidateFeedbackEntries })
      : ''
  ).current
  const newExpressionAfterConfirmationRef = useRef(Boolean(settledEntrySignature))
  const [draftSaveStatus, setDraftSaveStatus] = useState(
    settledEntrySignature ? '上次表达已确认，可以开始新表达。' : ''
  )
  const [draftSaveFailed, setDraftSaveFailed] = useState(false)
  const [savedDraftSignature, setSavedDraftSignature] = useState(settledEntrySignature)
  const [pendingAiRecovery, setPendingAiRecovery] = useState(Boolean(initialExpressionDraft?.pendingAi))
  const clearPendingAiRef = useRef(false)
  const lastSavedDraftSignatureRef = useRef(settledEntrySignature)
  const speechGenerationRef = useRef(0)
  const speechRateRef = useRef(speechRate)
  const isSpeakingRef = useRef(false)
  const playbackOutputRef = useRef(session.selectedTiles)
  const candidateAutoplayControllerRef =
    useRef<CandidateAutoplayController | null>(null)
  const aiGenerationRef = useRef(0)
  const aiPendingRef = useRef(false)
  const textAi = useTaroTextAiAvailability()
  const aiContextRef = useRef(textAi.contextKey)
  const pageActiveRef = useRef(true)
  const shareGenerationRef = useRef(0)
  const sharePendingRef = useRef(false)
  const candidateFeedbackDraftIdRef = useRef<string | null>(
    initialCandidateFeedbackDraft
      ? initialCandidateFeedbackDraft.id
      : null
  )
  const confirmedHistoryIdRef = useRef<string | null>(null)
  // Namesakes may share a tile ID; invalidation follows concrete identity and
  // media snapshot, never only IDs or display labels.
  const selectionSignature = JSON.stringify(session.pipeline.outputSnapshot)
  const selectionSignatureRef = useRef(selectionSignature)
  const previousAiSelectionRef = useRef(selectionSignature)
  selectionSignatureRef.current = selectionSignature
  speechRateRef.current = speechRate
  playbackOutputRef.current = session.selectedTiles
  const candidateSignature = session.pipeline.candidateSentences.join('\u001f')
  const candidateFeedbackSignatureRef = useRef(candidateSignature)
  const selectedSentence = getSelectedExpressionSentence(session.pipeline)
  // Include identity and meaning, not just the visible text of a namesake.
  const shareSignature = JSON.stringify([
    conversationContext.sessionId, selectionSignature, session.pipeline.outputSignature,
    candidateSignature, selectedSentence
  ])
  const shareSignatureRef = useRef(shareSignature)
  const previousShareSignatureRef = useRef(shareSignature)
  shareSignatureRef.current = shareSignature
  const activeBoard = getActiveNavigationBoard(boards, boardNavigation)
  const fixedGrid = Array.isArray(activeBoard?.layout.cells)
  const visibleTiles = fixedGrid && activeBoard ? getBoardDTOGridSlots(activeBoard) : sortPictogramsForDisplay(
    getVisibleBoardTiles(boards, boardNavigation),
    pictogramSortMode,
    pictogramOrdering,
    activeBoard ? activeBoard.id : ''
  )
  const pictogramSuggestions = useMemo(
    () =>
      buildExpressionPictogramSuggestions(
        boards,
        session.selectedTiles,
        pictogramOrdering,
        {
          activeBoardId: activeBoard ? activeBoard.id : '',
          limit: 6
        }
      ),
    [activeBoard, boards, pictogramOrdering, session.selectedTiles]
  )
  const draftSnapshot: ExpressionDraftSnapshot = {
    pipeline: session.pipeline,
    rejected: candidatesRejected,
    candidateFeedbackEntries
  }
  const draftSnapshotRef = useRef(draftSnapshot)
  draftSnapshotRef.current = draftSnapshot
  const draftSignature = JSON.stringify(draftSnapshot)
  // A successful write belongs to that exact revision, not the next render.
  // Keep the old success label hidden while newly edited content is pending.
  const draftVisibleSaveStatus = draftSaveFailed || isExpressionConfirmed
    ? draftSaveStatus
    : savedDraftSignature === draftSignature ? draftSaveStatus : '正在保存到本机…'

  const persistDraft = (startNew = false) => {
    if (!draftService) return true
    try {
      const record = draftService.save({
        ...draftSnapshotRef.current,
        ...(clearPendingAiRef.current ? { pendingAi: null } : {})
      }, { startNew: (startNew || newExpressionAfterConfirmationRef.current) &&
        draftService.getCurrent()?.status === 'confirmed' })
      newExpressionAfterConfirmationRef.current = false
      clearPendingAiRef.current = false
      lastSavedDraftSignatureRef.current = JSON.stringify(draftSnapshotRef.current)
      setSavedDraftSignature(lastSavedDraftSignatureRef.current)
      setPendingAiRecovery(Boolean(record.snapshot.pendingAi))
      setDraftSaveFailed(false)
      setDraftSaveStatus(record.status === 'confirmed' ? '表达已确认' : '已保存到本机')
      return true
    } catch (error) {
      setDraftSaveFailed(true)
      setDraftSaveStatus(error instanceof Error ? error.message : '草稿未能保存到本机，请重试。')
      return false
    }
  }
  useEffect(() => {
    if (isExpressionConfirmed || lastSavedDraftSignatureRef.current === draftSignature) return
    persistDraft()
    // The signature includes ordered private references, feedback and selection.
    // Persistence is local only and does not retain undo/playback controller state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSignature, isExpressionConfirmed])
  useEffect(() => {
    if (candidateFeedbackSignatureRef.current === candidateSignature) return

    candidateFeedbackSignatureRef.current = candidateSignature
    const draftId = candidateFeedbackDraftIdRef.current
    if (draftId && !candidatesRejectedRef.current) onDiscardCandidateFeedbackDraft(draftId)
    candidateFeedbackDraftIdRef.current = null
    confirmedHistoryIdRef.current = null
    setIsExpressionConfirmed(false)
    setCandidateFeedbackEntries(
      normalizeExpressionCandidates(
        [],
        session.pipeline.candidateSentences
      )
    )
    setCandidateFeedbackNotice('')
  }, [
    candidateSignature,
    onDiscardCandidateFeedbackDraft,
    session.pipeline.candidateSentences
  ])

  const stopSpeechPlayback = (announce = true) => {
    const wasSpeaking = isSpeakingRef.current
    speechGenerationRef.current += 1
    isSpeakingRef.current = false
    stopExpressionPlayback(wechatSpeechPort, wechatTileAudioPort)
    setIsSpeaking(false)
    if (announce && wasSpeaking) setNotice('朗读已停止。')
  }

  const playCandidateQueue = async (
    candidateSentences: string[],
    output = playbackOutputRef.current
  ) => {
    const queue = candidateSentences.map(sentence => sentence.trim()).filter(Boolean)
    if (!queue.length) {
      setNotice('没有可朗读的候选句。')
      return
    }

    const generation = ++speechGenerationRef.current
    isSpeakingRef.current = true
    setIsSpeaking(true)
    setNotice(queue.length > 1 ? '正在依次朗读全部候选句…' : '正在朗读…')

    for (const sentence of queue) {
      const result = await playExpressionSentence({
        sentence,
        output,
        speechPort: wechatSpeechPort,
        audioPort: wechatTileAudioPort,
        rate: speechRateRef.current,
        isCurrent: () => generation === speechGenerationRef.current
      })
      if (generation !== speechGenerationRef.current) return
      if (!result.ok) {
        isSpeakingRef.current = false
        setIsSpeaking(false)
        setNotice(result.message)
        return
      }
    }

    if (generation === speechGenerationRef.current) {
      isSpeakingRef.current = false
      setIsSpeaking(false)
      setNotice(queue.length > 1 ? '候选句已全部播报。' : '朗读完成。')
      return true
    }
    return false
  }

  if (!candidateAutoplayControllerRef.current) {
    candidateAutoplayControllerRef.current =
      createCandidateAutoplayController({
        setTimer: (callback, delay) => setTimeout(callback, delay),
        clearTimer: timer => clearTimeout(timer),
        playCandidates: async candidates => {
          if (pageActiveRef.current && !candidatesRejectedRef.current) await playCandidateQueue(candidates)
        },
        stopPlayback: () => stopSpeechPlayback(false),
        onPendingChange: setPendingAutoplayDelayMs
      })
  }

  useEffect(() => {
    if (rejectionSelectionRef.current !== session.pipeline.outputSignature) {
      rejectionSelectionRef.current = session.pipeline.outputSignature
      candidatesRejectedRef.current = Boolean(feedbackInputRef.current?.rejected)
      setCandidatesRejected(candidatesRejectedRef.current)
      candidateFeedbackDraftIdRef.current = feedbackInputRef.current?.id || null
      confirmedHistoryIdRef.current = null
      setIsExpressionConfirmed(false)
      setCandidateFeedbackEntries(normalizeExpressionCandidates(
        feedbackInputRef.current?.candidates || [], session.pipeline.candidateSentences
      ))
      setCandidateFeedbackNotice('')
    }
    if (previousAiSelectionRef.current !== selectionSignature) {
      previousAiSelectionRef.current = selectionSignature
      aiGenerationRef.current += 1
      aiPendingRef.current = false
      setIsGeneratingAi(false)
    }
    if (!pageActiveRef.current || candidatesRejectedRef.current || restorationMutedRef.current) {
      candidateAutoplayControllerRef.current?.cancel()
      return
    }
    if (aiPendingRef.current) return
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.schedule(
        session.pipeline.candidateSentences,
        candidateAutoplayDelaySeconds
      )
    }
  }, [
    aiCompletion,
    candidateAutoplayDelaySeconds,
    candidateSignature,
    selectionSignature,
    session.pipeline.outputSignature,
    session.pipeline.candidateSentences
  ])

  useEffect(() => {
    pageActiveRef.current = true
    return () => {
      pageActiveRef.current = false
      shareGenerationRef.current += 1
      sharePendingRef.current = false
      const controller = candidateAutoplayControllerRef.current
      if (controller) {
        controller.cancel({ stopActivePlayback: false })
      }
      speechGenerationRef.current += 1
      isSpeakingRef.current = false
      aiGenerationRef.current += 1
      aiPendingRef.current = false
      stopExpressionPlayback(wechatSpeechPort, wechatTileAudioPort)
    }
  }, [])

  useEffect(() => {
    if (previousShareSignatureRef.current === shareSignature) return
    previousShareSignatureRef.current = shareSignature
    const wasPending = sharePendingRef.current
    shareGenerationRef.current += 1
    sharePendingRef.current = false
    setIsSharing(false)
    if (wasPending) setNotice('表达已改变，请重新确认要复制的句子。')
  }, [shareSignature])

  const invalidatePendingShare = () => {
    shareGenerationRef.current += 1
    sharePendingRef.current = false
    setIsSharing(false)
  }

  // Same contract as Web: explicit patient actions own the current expression.
  // Invalidate before awaiting anything; an old request cannot clear a new one.
  const invalidatePendingAi = () => {
    aiGenerationRef.current += 1
    aiPendingRef.current = false
    setIsGeneratingAi(false)
  }

  const handlePatientInteraction = () => {
    const controller = candidateAutoplayControllerRef.current
    const cancelled = controller
      ? controller.cancel({ stopActivePlayback: false })
      : null
    if ((cancelled && cancelled.hadActive) || isSpeakingRef.current) {
      stopSpeechPlayback()
    }
  }

  const handleWorkspaceHide = () => {
    // Flush rendered edits through the same verified repository before leaving.
    // This is not a delayed background save and does not start AI or playback.
    if (draftService && !isExpressionConfirmed &&
      lastSavedDraftSignatureRef.current !== JSON.stringify(draftSnapshotRef.current)) persistDraft()
    pageActiveRef.current = false
    const wasCopying = sharePendingRef.current
    const wasGenerating = aiPendingRef.current
    invalidatePendingShare()
    invalidatePendingAi()
    handlePatientInteraction()
    if (wasCopying) setNotice('已离开复制页面；返回后请重新确认剪贴板中的句子。')
    else if (wasGenerating) {
      if (draftService) setPendingAiRecovery(Boolean(draftService.getCurrent()?.snapshot.pendingAi))
      setNotice('已离开页面，旧 AI 结果不再更新此页；返回后可主动核对上次结果。')
    }
  }
  useDidHide(handleWorkspaceHide)
  useDidShow(() => {
    pageActiveRef.current = true
    if (draftService) setPendingAiRecovery(Boolean(draftService.getCurrent()?.snapshot.pendingAi))
  })
  useEffect(() => {
    if (aiContextRef.current === textAi.contextKey) return
    aiContextRef.current = textAi.contextKey
    invalidatePendingAi()
    candidateAutoplayControllerRef.current?.cancel()
    stopSpeechPlayback()
  }, [textAi.contextKey])

  const handleEditSelectedTile = (
    action: ExpressionSessionAction,
    message: string
  ) => {
    restorationMutedRef.current = false
    invalidatePendingShare()
    invalidatePendingAi()
    handlePatientInteraction()
    dispatch(action)
    setNotice(message)
  }

  const handleAddTile = (tile: BoardDTO['tiles'][number]) => {
    if (session.selectedTiles.length >= MAX_EXPRESSION_TILES) {
      setNotice(`一次最多选择 ${MAX_EXPRESSION_TILES} 张图片。`)
      return
    }

    restorationMutedRef.current = false
    invalidatePendingShare()
    invalidatePendingAi()
    handlePatientInteraction()
    onPictogramUsed(tile.boardId, tile.id)
    dispatch({ type: 'add-tile', tile })
    setNotice(`已加入「${tile.label}」。`)
  }

  const repairSelectedImage = (index: number, tile: BoardDTO['tiles'][number]) => {
    const selectedTiles = session.selectedTiles.map((item, i) => i === index ? tile : item)
    const pipeline = { ...session.pipeline, outputSnapshot: selectedTiles }
    try {
      if (draftService) draftService.save({ ...draftSnapshotRef.current, pipeline, pendingAi: null },
        { startNew: draftService.getCurrent()?.status === 'confirmed' })
    } catch (_) {
      setDraftSaveFailed(true); setDraftSaveStatus('图片修改尚未保存，请重试确认。'); return false
    }
    invalidatePendingShare(); invalidatePendingAi(); handlePatientInteraction(); stopSpeechPlayback()
    restorationMutedRef.current = true
    setIsExpressionConfirmed(false)
    dispatch({ type: 'replace-session', state: { ...session, selectedTiles, pipeline } })
    return true
  }

  const handleConfirm = () => {
    if (candidatesRejectedRef.current) return
    invalidatePendingShare()
    invalidatePendingAi()
    const historyEntry = buildExpressionHistoryEntry(
      session.pipeline,
      candidateFeedbackEntries
    )
    if (!historyEntry) {
      setNotice('请先选择至少一张图片。')
      return
    }

    if (isExpressionConfirmed) {
      setNotice('这次表达已经确认。')
      return
    }
    if (!persistDraft()) {
      setNotice('草稿尚未可靠保存，请重试保存后再确认。')
      return
    }

    const draftId = candidateFeedbackDraftIdRef.current
    const persisted = persistExpressionHistoryEntry(
      {
        ...historyEntry,
        ...(draftId ? { id: draftId } : {}),
        recordStatus: 'confirmed'
      },
      onConfirm
    )
    if (!persisted) {
      setNotice('表达已生成，但本地保存失败，请稍后再试。')
      return
    }

    confirmedHistoryIdRef.current = persisted.id || draftId || null
    if (draftId) onDiscardCandidateFeedbackDraft(draftId)
    candidateFeedbackDraftIdRef.current = null
    setIsExpressionConfirmed(true)
    setDraftSaveStatus('表达已确认')
    setNotice('表达已确认，并保存到微信本地存储。')
  }

  const handleSpeech = async () => {
    if (candidatesRejectedRef.current) return
    invalidatePendingShare()
    invalidatePendingAi()
    if (!selectedSentence) {
      setNotice('请先选择图片并生成句子。')
      return
    }

    const controller = candidateAutoplayControllerRef.current
    if (controller) controller.cancel()
    await playCandidateQueue([selectedSentence])
  }

  const handlePlayAllCandidates = async () => {
    if (candidatesRejectedRef.current) return
    invalidatePendingShare()
    invalidatePendingAi()
    const controller = candidateAutoplayControllerRef.current
    if (controller) controller.cancel()
    await playCandidateQueue(session.pipeline.candidateSentences)
  }

  const handleStopSpeech = () => {
    invalidatePendingShare()
    invalidatePendingAi()
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.cancel({ stopActivePlayback: false })
    }
    stopSpeechPlayback(false)
    setNotice('已停止朗读并取消自动播报。')
  }

  const handleRejectCandidates = () => {
    if (!session.pipeline.candidateSentences.length) return
    candidatesRejectedRef.current = true
    setCandidatesRejected(true)
    handleStopSpeech()
    setIsExpressionConfirmed(false)
    confirmedHistoryIdRef.current = null
    setNotice('已停止这组候选。图片已保留，请调整图片，或撤销拒绝后手动选择。')
    try {
      const draft = onSaveCandidateFeedbackDraft({
        ...(!isExpressionConfirmed && candidateFeedbackDraftIdRef.current
          ? { id: candidateFeedbackDraftIdRef.current } : {}),
        outputSignature: session.pipeline.outputSignature,
        candidates: candidateFeedbackEntries,
        rejected: true
      })
      if (!draft?.id) throw new Error('Rejection not saved')
      candidateFeedbackDraftIdRef.current = draft.id
      setCandidateFeedbackNotice('')
    } catch (_) {
      setCandidateFeedbackNotice('本次已停止，但拒绝状态未能保存，重开页面可能丢失；请重试保存。')
    }
  }

  const handleUndoRejection = () => {
    if (!candidatesRejectedRef.current) return
    handleStopSpeech()
    try {
      const id = candidateFeedbackDraftIdRef.current
      if (id && onDiscardCandidateFeedbackDraft(id) === false)
        throw new Error('Rejection not removed')
    } catch (_) {
      setCandidateFeedbackNotice('撤销未能保存，候选仍保持停止，请重试。')
      return
    }
    candidateFeedbackDraftIdRef.current = null
    candidatesRejectedRef.current = false
    setCandidatesRejected(false)
    setCandidateFeedbackEntries(normalizeExpressionCandidates([], session.pipeline.candidateSentences))
    setCandidateFeedbackNotice('')
    setNotice('已恢复候选，请手动选择；不会自动播报或再次调用 AI。')
  }

  const handleSelectCandidate = async (sentence: string, index: number) => {
    if (candidatesRejectedRef.current) return
    restorationMutedRef.current = false
    if (index !== session.pipeline.selectedIndex) {
      confirmedHistoryIdRef.current = null
      setIsExpressionConfirmed(false)
    }
    invalidatePendingShare()
    invalidatePendingAi()
    const controller = candidateAutoplayControllerRef.current
    if (controller) controller.cancel()
    dispatch({ type: 'select-candidate', index })
    await playCandidateQueue([sentence])
  }

  const handleCandidateFeedback = (
    candidateIndex: number,
    feedback: 'up' | 'down'
  ) => {
    if (candidatesRejectedRef.current) return
    invalidatePendingAi()
    const next = toggleExpressionCandidateFeedback(
      candidateFeedbackEntries,
      candidateIndex,
      feedback
    )
    setCandidateFeedbackEntries(next)

    const historyEntry = buildExpressionHistoryEntry(session.pipeline, next)
    if (!historyEntry) return

    if (isExpressionConfirmed) {
      const persisted = persistExpressionHistoryEntry(
        {
          ...historyEntry,
          ...(confirmedHistoryIdRef.current
            ? { id: confirmedHistoryIdRef.current }
            : {}),
          recordStatus: 'confirmed'
        },
        onConfirm
      )
      if (persisted && persisted.id) {
        confirmedHistoryIdRef.current = persisted.id
        setCandidateFeedbackNotice(
          candidateFeedbackSyncAvailable
            ? '反馈已保存，并会纳入下次云同步。'
            : '反馈已保存在本机，登录后可同步。'
        )
      } else {
        setCandidateFeedbackNotice('反馈保存失败，请稍后重试。')
      }
      return
    }

    if (!next.some(candidate => candidate.feedback)) {
      const draftId = candidateFeedbackDraftIdRef.current
      if (draftId) onDiscardCandidateFeedbackDraft(draftId)
      candidateFeedbackDraftIdRef.current = null
      setCandidateFeedbackNotice('已取消这条反馈。')
      return
    }

    const draft = onSaveCandidateFeedbackDraft({
      ...(candidateFeedbackDraftIdRef.current
        ? { id: candidateFeedbackDraftIdRef.current }
        : {}),
      outputSignature: session.pipeline.outputSignature,
      candidates: next
    })
    if (!draft) {
      setCandidateFeedbackNotice('反馈保存失败，请稍后重试。')
      return
    }

    candidateFeedbackDraftIdRef.current = draft.id
    setCandidateFeedbackNotice(
      candidateFeedbackSyncAvailable
        ? '反馈已保存，并会纳入下次云同步。'
        : '反馈已保存在本机，登录后可同步。'
    )
  }

  const getCandidateFeedback = (candidateIndex: number) =>
    candidateFeedbackEntries[candidateIndex]
      ? candidateFeedbackEntries[candidateIndex].feedback
      : null

  const handleSavePhrase = () => {
    if (candidatesRejectedRef.current) return
    invalidatePendingShare()
    invalidatePendingAi()
    const savedPhrase = buildExpressionSavedPhraseEntry(session.pipeline)
    if (!savedPhrase) {
      setNotice('请先选择图片并生成一句话。')
      return
    }

    try {
      if (!onSavePhrase(savedPhrase)) throw new Error('本次收藏尚未保存。')
      setNotice('已收藏为常用语，下次可以一键使用。')
    } catch (error) {
      setNotice(`${(error as Error).message || '常用语保存失败。'} 当前表达已保留，请整理后或稍后重试收藏。`)
    }
  }

  const handleReusePhrase = (item: CommunicationSavedPhraseEntry) => {
    if (candidatesRejectedRef.current) {
      setNotice('请先撤销拒绝，或调整已选图片。')
      return
    }
    restorationMutedRef.current = false
    invalidatePendingShare()
    invalidatePendingAi()
    handlePatientInteraction()
    if (!onReusePhrase(item)) {
      setNotice('这条常用语暂时未能载入，原内容已保留，请重试。')
      return
    }

    // Reusing the same saved sentence is a deliberate new expression even when
    // its content signature equals the just-confirmed one. Do not alter history.
    if (draftService?.getCurrent()?.status === 'confirmed') {
      newExpressionAfterConfirmationRef.current = true
      lastSavedDraftSignatureRef.current = ''
      confirmedHistoryIdRef.current = null
      candidateFeedbackDraftIdRef.current = null
      setCandidateFeedbackEntries(normalizeExpressionCandidates([], session.pipeline.candidateSentences))
      setIsExpressionConfirmed(false)
    }

    setNotice(`已载入常用语「${item.sentence}」。`)
  }

  const handleShareExpression = async () => {
    if (!pageActiveRef.current || candidatesRejectedRef.current || sharePendingRef.current) return
    if (shareSignature !== shareSignatureRef.current) return
    if (!selectedSentence) {
      setNotice('请先选择一句话再分享。')
      return
    }

    invalidatePendingAi()
    handlePatientInteraction()
    const generation = ++shareGenerationRef.current
    const isCurrent = () => pageActiveRef.current && !candidatesRejectedRef.current &&
      generation === shareGenerationRef.current && shareSignature === shareSignatureRef.current
    sharePendingRef.current = true
    setIsSharing(true)
    setNotice('正在复制当前句子…')
    try {
      const result = await taroCommunicationSharePort.shareExpressionText(selectedSentence, { isCurrent })
      if (isCurrent()) setNotice(result.message)
    } catch (_) {
      if (isCurrent()) setNotice('句子复制失败，当前表达仍会保留，请重试。')
    } finally {
      if (isCurrent()) {
        sharePendingRef.current = false
        setIsSharing(false)
      }
    }
  }

  const handlePlaySavedPhrase = async (
    item: CommunicationSavedPhraseEntry
  ) => {
    if (savedPlaybackPending.current) return
    invalidatePendingShare()
    invalidatePendingAi()
    handlePatientInteraction()
    setPlaybackPhrase(item)
    savedPlaybackCounted.current = false
    savedPlaybackPending.current = true
    setNotice(`正在播报常用语「${item.sentence}」。`)
    const playback = playCandidateQueue([item.sentence], item.output)
    const ticket = speechGenerationRef.current
    const success = await playback
    if (ticket !== speechGenerationRef.current) return
    savedPlaybackPending.current = false
    if (success && !savedPlaybackCounted.current) {
      savedPlaybackCounted.current = true
      onUseSavedPhrase(item)
    }
  }

  const handleReplaySavedPhrase = async () => {
    if (!playbackPhrase || savedPlaybackPending.current) return
    invalidatePendingShare()
    handlePatientInteraction()
    savedPlaybackPending.current = true
    const playback = playCandidateQueue(
      [playbackPhrase.sentence],
      playbackPhrase.output
    )
    const ticket = speechGenerationRef.current
    const success = await playback
    if (ticket !== speechGenerationRef.current) return
    savedPlaybackPending.current = false
    if (success && !savedPlaybackCounted.current) {
      savedPlaybackCounted.current = true
      onUseSavedPhrase(playbackPhrase)
    }
  }

  const handleViewSavedPhrase = (item: CommunicationSavedPhraseEntry) => {
    invalidatePendingShare()
    invalidatePendingAi()
    handlePatientInteraction()
    candidateAutoplayControllerRef.current?.cancel()
    stopSpeechPlayback(false)
    savedPlaybackPending.current = false
    savedPlaybackCounted.current = false
    setPlaybackPhrase(item)
    setNotice('仅查看，点击“播报整句”才会播放。')
  }

  const handleCloseSavedPhrasePlayback = () => {
    savedPlaybackPending.current = false
    savedPlaybackCounted.current = false
    invalidatePendingShare()
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.cancel({ stopActivePlayback: false })
    }
    stopSpeechPlayback(false)
    setPlaybackPhrase(null)
    setNotice('已返回，当前表达保持不变。')
  }

  const handleGenerateAiCandidates = async () => {
    if (candidatesRejectedRef.current || aiPendingRef.current) return
    const availability = getTaroTextAiAvailability()
    if (!availability.available) { setNotice(availability.message); return }
    const request = buildCommunicationAiSentenceRequest({
      output: session.pipeline.outputSnapshot,
      context: conversationContext,
      candidateCount: 3
    })
    if (!request.pictogramLabels.length) {
      setNotice('请先选择图片，再使用 AI 优化候选句。')
      return
    }
    if (!persistDraft(true)) {
      setNotice('草稿尚未可靠保存，未发起 AI 请求；请先重试保存。')
      return
    }
    if (draftService) {
      attachExpressionDraftRequest(request, draftService)
    }

    restorationMutedRef.current = false
    confirmedHistoryIdRef.current = null
    setIsExpressionConfirmed(false)
    invalidatePendingShare()
    const generation = ++aiGenerationRef.current
    const requestedSignature = selectionSignature
    aiPendingRef.current = true
    candidateAutoplayControllerRef.current?.cancel()
    setIsGeneratingAi(true)
    setNotice('正在请求 AI 候选句，本地候选仍然可用。')
    let receivedCandidates = false
    try {
      const result = await taroCommunicationAiPort.generateSentences(request)
      if (
        generation !== aiGenerationRef.current ||
        availability.contextKey !== getTaroTextAiAvailability().contextKey ||
        requestedSignature !== selectionSignatureRef.current
      ) return
      if (!result.ok || !result.value) {
        setNotice(result.message)
        return
      }
      if (draftService) {
        // Persist returned candidates together with clearing their pending
        // ticket, even when the provider repeats the same visible sentences.
        const pipeline = applyCommunicationAiSentenceResponse(session.pipeline, result.value)
        draftSnapshotRef.current = {
          ...draftSnapshotRef.current,
          pipeline,
          candidateFeedbackEntries: normalizeExpressionCandidates(
            draftSnapshotRef.current.candidateFeedbackEntries, pipeline.candidateSentences
          )
        }
        clearPendingAiRef.current = true
        persistDraft()
      }
      dispatch({ type: 'apply-ai-candidates', response: result.value })
      receivedCandidates = true
      setNotice(result.message)
    } catch (_) {
      if (generation === aiGenerationRef.current && requestedSignature === selectionSignatureRef.current)
        setNotice('AI 暂时不可用，已保留本地候选，可以稍后重试。')
    } finally {
      if (generation === aiGenerationRef.current) {
        if (draftService)
          setPendingAiRecovery(Boolean(draftService.getCurrent()?.snapshot.pendingAi))
        aiPendingRef.current = false
        setIsGeneratingAi(false)
        // An uncertain request is still awaiting reconciliation. Do not replace
        // that notice by restarting playback of the old local candidates.
        if (receivedCandidates && requestedSignature === selectionSignatureRef.current)
          setAiCompletion(value => value + 1)
      }
    }
  }

  return (
    <View
      className='workspace workspace--expression'
      onTouchStart={handlePatientInteraction}
    >
      {draftService && <View className='expression-draft-save-state'>
        <Text id='expression-draft-save-status'>{draftVisibleSaveStatus}</Text>
        {draftSaveFailed && <Button id='expression-draft-retry-save-button' onClick={() => persistDraft()}>重试保存草稿</Button>}
      </View>}
      <View className='panel expression-board-panel'>
        <View className='section-heading'>
          <Text className='section-heading__index'>01</Text>
          <View>
            <Text className='section-heading__title'>点图片表达</Text>
            <Text className='section-heading__hint'>已选图片按点选顺序组成表达</Text>
          </View>
        </View>

        <ScrollView
          scrollX
          className='expression-strip'
          onScroll={handlePatientInteraction}
        >
          <View className='expression-strip__inner'>
            {session.selectedTiles.length ? (
              session.selectedTiles.map((tile, index) => (
                <View className='expression-chip' key={`${tile.id}-${index}`}>
                  <PictogramImage localOnly
                    className='expression-chip__image'
                    src={tile.image}
                    label={tile.label}
                    mediaType={tile.mediaType}
                    video={tile.video}
                  />
                  <Text>{tile.label}</Text>
                  <ImageRepairControls tile={tile}
                    operationKey={JSON.stringify([draftService?.getCurrent()?.id, index, session.selectedTiles])}
                    onAdopt={nextTile => repairSelectedImage(index, nextTile)}
                    onKeepText={() => repairSelectedImage(index, { ...tile, image: '' })}
                  />
                  <View className='expression-chip__actions'>
                    <PatientActionButton
                      action={PATIENT_ACTION_IDS.moveLeft}
                      id={`expression-selected-${index}-left`}
                      className='expression-chip__action'
                      disabled={index === 0}
                      onClick={() =>
                        handleEditSelectedTile(
                          { type: 'move-tile', index, offset: -1 },
                          `已将「${tile.label}」左移。`
                        )
                      }
                      label='左移'
                      ariaLabel={`向左移动${tile.label}`}
                    />
                    <PatientActionButton
                      action={PATIENT_ACTION_IDS.moveRight}
                      id={`expression-selected-${index}-right`}
                      className='expression-chip__action'
                      disabled={index === session.selectedTiles.length - 1}
                      onClick={() =>
                        handleEditSelectedTile(
                          { type: 'move-tile', index, offset: 1 },
                          `已将「${tile.label}」右移。`
                        )
                      }
                      label='右移'
                      ariaLabel={`向右移动${tile.label}`}
                    />
                    <PatientActionButton
                      action={PATIENT_ACTION_IDS.remove}
                      id={`expression-selected-${index}-remove`}
                      className='expression-chip__action expression-chip__action--remove'
                      onClick={() =>
                        handleEditSelectedTile(
                          { type: 'remove-tile', index },
                          `已删除「${tile.label}」。`
                        )
                      }
                      label='删除'
                      ariaLabel={`删除${tile.label}`}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text className='expression-strip__empty'>还没有选择图片</Text>
            )}
          </View>
        </ScrollView>

        <View className='sequence-actions'>
          <PatientActionButton
            action={PATIENT_ACTION_IDS.remove}
            id='expression-backspace-button'
            outputIcon='backspace'
            className='button button--quiet'
            disabled={!session.selectedTiles.length}
            onClick={() => handleEditSelectedTile({ type: 'remove-last' }, '已退格，可以撤销删除。')}
            label='退格'
            ariaLabel='删除最后一张图片'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.undo}
            id='expression-undo-delete-button'
            outputIcon='undo'
            className='button button--quiet'
            disabled={!session.undoHistory?.length}
            onClick={() => handleEditSelectedTile({ type: 'undo-delete' }, '已恢复删除前的图片和候选句。')}
            label='撤销删除'
            ariaLabel='撤销上次删除，恢复图片序列'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.clear}
            id='expression-clear-button'
            outputIcon='clear'
            className='button button--quiet'
            disabled={!session.selectedTiles.length && !session.pipeline.candidateSentences.length}
            onClick={() => handleEditSelectedTile({ type: 'clear' }, '已清空，可以撤销删除。')}
            label='清空'
            ariaLabel='清空当前图片序列'
          />
        </View>

        {pictogramSuggestions.tiles.length > 0 && (
          <View className='pictogram-suggestions'>
            <View className='pictogram-suggestions__heading'>
              <Text className='pictogram-suggestions__title'>
                {pictogramSuggestions.mode ===
                PICTOGRAM_SUGGESTION_MODES.recent
                  ? '最近使用'
                  : '接下来可能需要'}
              </Text>
              <Text className='pictogram-suggestions__hint'>
                点一下即可加入当前表达
              </Text>
            </View>
            <ScrollView
              scrollX
              className='pictogram-suggestions__scroll'
              onScroll={handlePatientInteraction}
            >
              <View className='pictogram-suggestions__list'>
                {pictogramSuggestions.tiles.map(tile => (
                  <Button
                    id={`expression-suggestion-${tile.id}`}
                    className='pictogram-suggestion'
                    key={`${tile.boardId}:${tile.id}`}
                    style={{ backgroundColor: tile.backgroundColor }}
                    onClick={() => handleAddTile(tile)}
                  >
                    <PictogramImage
                      className='pictogram-suggestion__image'
                      src={tile.image}
                      label={tile.label}
                      mediaType={tile.mediaType}
                      video={tile.video}
                    />
                    <Text className='pictogram-suggestion__label'>
                      {tile.label}
                    </Text>
                  </Button>
                ))}
              </View>
            </ScrollView>
          </View>
          )}

        <View className='board-section-heading'>
          <Text className='board-section-heading__title'>
            {activeBoard ? activeBoard.name : '默认图板'}
          </Text>
          <Text className='board-section-heading__hint'>
            {fixedGrid ? '固定图板保留原列数与空位；点图片加入表达' : '点分类进入子板，点图片加入表达，可重复选择'}
          </Text>
        </View>

        <BoardNavigator
          boards={boards}
          state={boardNavigation}
          onChange={setBoardNavigation}
        />

        <View className='tile-grid' style={fixedGrid ? { gridTemplateColumns: `repeat(${activeBoard!.layout.columns}, minmax(0, 1fr))` } : undefined}>
          {visibleTiles.map((tile, index) => tile ? (
            <Button
              id={`expression-tile-${tile.id}`}
              className={`tile-button ${
                isNavigationTile(tile) ? 'tile-button--folder' : ''
              }`}
              key={getBoardTileKey(tile)}
              style={{ backgroundColor: tile.backgroundColor }}
              onClick={() => {
                if (isNavigationTile(tile)) {
                  const nextNavigation = openNavigationTile(
                    boards,
                    boardNavigation,
                    tile
                  )
                  if (nextNavigation !== boardNavigation) {
                    setBoardNavigation(nextNavigation)
                    setNotice(`已打开「${tile.label}」。`)
                  }
                  return
                }

                handleAddTile(tile)
              }}
            >
              {isNavigationTile(tile) && (
                <Text className='tile-button__folder-badge'>进入</Text>
              )}
              {tile.image ? (
                <PictogramImage
                  className='tile-button__image'
                  src={tile.image}
                  label={tile.label}
                  mediaType={tile.mediaType}
                  video={tile.video}
                  videoAutoplay={tile.mediaType === 'video'}
                />
              ) : (
                <Text className='tile-button__folder-icon'>板</Text>
              )}
              <Text className='tile-button__label'>{tile.label}</Text>
            </Button>
          ) : <View key={`empty-${index}`} className='tile-grid__empty' aria-hidden style={{ minHeight: '120px' }} />)}
        </View>
      </View>

      <SavedPhrasesPanel
        items={savedPhrases}
        onReuse={handleReusePhrase}
        onPlay={handlePlaySavedPhrase}
        onView={handleViewSavedPhrase}
      />
      <PhrasePlaybackOverlay
        item={playbackPhrase}
        isSpeaking={isSpeaking}
        status={notice}
        onReplay={handleReplaySavedPhrase}
        onClose={handleCloseSavedPhrasePlayback}
      />

      <View className='panel candidate-panel'>
        <View className='section-heading'>
          <Text className='section-heading__index'>02</Text>
          <View>
            <Text className='section-heading__title'>选择一句话</Text>
            <Text className='section-heading__hint'>
              {session.pipeline.candidateProvider
                ? '当前候选由 AI 生成，可随时改回本地图卡重新生成'
                : '默认使用本地表达规则，登录后可选用 AI 增强'}
            </Text>
          </View>
        </View>

        <View className='candidate-list'>
          {candidatesRejected ? (
            <Text className='candidate-list__empty'>已停止这组候选。图片已保留，请调整图片，或撤销拒绝后手动选择。</Text>
          ) : session.pipeline.candidateSentences.length ? (
            session.pipeline.candidateSentences.map((sentence, index) => (
              <View className='candidate-row' key={sentence}>
                <Button
                  id={`expression-candidate-${index}`}
                  className={`candidate ${
                    index === session.pipeline.selectedIndex ? 'candidate--selected' : ''
                  }`}
                  onClick={() => void handleSelectCandidate(sentence, index)}
                >
                  <Text className='candidate__marker'>
                    {index === session.pipeline.selectedIndex ? '已选' : `0${index + 1}`}
                  </Text>
                  <Text className='candidate__sentence'>{sentence}</Text>
                </Button>
                <View
                  className='candidate-feedback'
                  onTouchStart={event => event.stopPropagation()}
                >
                  <Button
                    id={`expression-candidate-${index}-feedback-up`}
                    className={`candidate-feedback__button ${
                      getCandidateFeedback(index) ===
                      CANDIDATE_FEEDBACK.up
                        ? 'candidate-feedback__button--active'
                        : ''
                    }`}
                    aria-label={`有帮助：${sentence}`}
                    aria-pressed={
                      getCandidateFeedback(index) ===
                      CANDIDATE_FEEDBACK.up
                    }
                    onClick={event => {
                      event.stopPropagation()
                      handleCandidateFeedback(index, CANDIDATE_FEEDBACK.up)
                    }}
                  >
                    有帮助
                  </Button>
                  <Button
                    id={`expression-candidate-${index}-feedback-down`}
                    className={`candidate-feedback__button ${
                      getCandidateFeedback(index) ===
                      CANDIDATE_FEEDBACK.down
                        ? 'candidate-feedback__button--active'
                        : ''
                    }`}
                    aria-label={`不符合：${sentence}`}
                    aria-pressed={
                      getCandidateFeedback(index) ===
                      CANDIDATE_FEEDBACK.down
                    }
                    onClick={event => {
                      event.stopPropagation()
                      handleCandidateFeedback(index, CANDIDATE_FEEDBACK.down)
                    }}
                  >
                    不符合
                  </Button>
                </View>
              </View>
            ))
          ) : (
            <Text className='candidate-list__empty'>选择图片后，这里会出现候选句。</Text>
          )}
        </View>
        <Text className='candidate-feedback__notice'>
          {candidateFeedbackNotice ||
            '可评价候选句；评价不会触发或中断朗读。'}
        </Text>
        <Text className='storage-notice'>
          {candidatesRejected
            ? '已暂停自动播报。'
            : pendingAutoplayDelayMs
            ? `${pendingAutoplayDelayMs / 1000} 秒无操作后自动播报全部候选句；触摸或滚动可取消。`
            : isSpeaking
            ? '正在播报。'
            : candidateAutoplayDelaySeconds
            ? '当前不会自动播报，请手动选择一句或全部播报。'
            : '候选句自动播报已关闭，可手动选择一句或全部播报。'}
        </Text>
        {!!session.selectedTiles.length && (
          <View className='primary-actions'>
            <PatientActionButton
              action={PATIENT_ACTION_IDS.notUnderstood}
              id='expression-reject-candidates-button'
              className='button button--outline'
              onClick={handleRejectCandidates}
              label='都不对'
              ariaLabel='这组候选都不对，停止并保留图片'
            />
            {candidatesRejected && (
              <PatientActionButton
                action={PATIENT_ACTION_IDS.undo}
                id='expression-undo-rejection-button'
                className='button button--outline'
                onClick={handleUndoRejection}
                label='撤销拒绝'
                ariaLabel='撤销拒绝'
              />
            )}
          </View>
        )}

        <View className='section-heading expression-finish-heading'>
          <Text className='section-heading__index'>03</Text>
          <View>
            <Text className='section-heading__title'>朗读或保存</Text>
            <Text className='section-heading__hint'>确认后可朗读，也可以收藏为常用语</Text>
          </View>
        </View>

        <View className='primary-actions'>
          <PatientActionButton
            action={PATIENT_ACTION_IDS.improve}
            id='expression-ai-candidates-button'
            className='button button--ai'
            disabled={!textAi.available || candidatesRejected || !session.selectedTiles.length || isGeneratingAi}
            onClick={() => void handleGenerateAiCandidates()}
            label={isGeneratingAi ? '核对中' : pendingAiRecovery ? '核对上次结果' : '优化'}
            ariaLabel={
              isGeneratingAi ? '正在请求候选句' : pendingAiRecovery ? '核对上次 AI 结果' : 'AI 优化候选句'
            }
          />
          {!textAi.available && <View id='expression-text-ai-availability'>
            <Text>{textAi.message}</Text>
            {textAi.action && <Button onClick={() => void openTextAiSetup(textAi.action)}>
              {textAi.action === 'login' ? '前往登录' : '选择档案与额度'}
            </Button>}
          </View>}
          <PatientActionButton
            action={PATIENT_ACTION_IDS.confirm}
            id='expression-confirm-button'
            className='button button--primary'
            disabled={candidatesRejected || !selectedSentence || isExpressionConfirmed}
            onClick={handleConfirm}
            label='确认'
            ariaLabel='确认并保存当前表达'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.play}
            className='button button--outline'
            disabled={candidatesRejected || !selectedSentence || isSpeaking}
            onClick={handleSpeech}
            label={isSpeaking ? '朗读中' : '朗读'}
            ariaLabel={isSpeaking ? '正在朗读当前句子' : '朗读当前句子'}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.playAll}
            className='button button--outline'
            disabled={candidatesRejected || !session.pipeline.candidateSentences.length || isSpeaking}
            onClick={() => void handlePlayAllCandidates()}
            label='全播'
            ariaLabel='依次朗读全部候选句'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.stop}
            className='button button--quiet'
            disabled={!session.pipeline.candidateSentences.length}
            onClick={handleStopSpeech}
            label='停止'
            ariaLabel='停止当前朗读'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.save}
            className='button button--favorite'
            disabled={candidatesRejected || !selectedSentence}
            onClick={handleSavePhrase}
            label='收藏'
            ariaLabel='收藏当前句子为常用语'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.share}
            id='expression-share-button'
            className='button button--outline'
            disabled={candidatesRejected || !selectedSentence || isSharing}
            onClick={() => void handleShareExpression()}
            label={isSharing ? '复制中' : '分享'}
            ariaLabel={isSharing ? '正在复制当前句子' : '复制分享当前句子'}
          />
        </View>
        <View
          id='expression-status-notice'
          className='storage-notice'
          role='status'
          aria-live='polite'
        >
          {notice}
        </View>
      </View>
    </View>
  )
}


