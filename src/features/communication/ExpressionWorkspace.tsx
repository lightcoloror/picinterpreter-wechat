import type { Dispatch } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
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
import { buildCommunicationAiSentenceRequest } from '@cboard-communication-core/communicationAi'
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
import { taroCommunicationSharePort } from '../../platform/taroCommunicationSharePort'
import {
  wechatSpeechPort,
  wechatTileAudioPort
} from '../../platform/taroSpeechPort'
import BoardNavigator from './BoardNavigator'
import PatientActionButton from './PatientActionButton'
import PictogramImage from '../../components/PictogramImage'
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
      ? '已从微信本地存储恢复最近一次表达。'
      : '选择图片开始表达。'
  )
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [playbackPhrase, setPlaybackPhrase] =
    useState<CommunicationSavedPhraseEntry | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [candidateFeedbackEntries, setCandidateFeedbackEntries] = useState(
    () =>
      normalizeExpressionCandidates(
        initialCandidateFeedbackDraft
          ? initialCandidateFeedbackDraft.candidates
          : [],
        session.pipeline.candidateSentences
      )
  )
  const [candidateFeedbackNotice, setCandidateFeedbackNotice] = useState('')
  const [isExpressionConfirmed, setIsExpressionConfirmed] = useState(false)
  const speechGenerationRef = useRef(0)
  const speechRateRef = useRef(speechRate)
  const isSpeakingRef = useRef(false)
  const playbackOutputRef = useRef(session.selectedTiles)
  const candidateAutoplayControllerRef =
    useRef<CandidateAutoplayController | null>(null)
  const aiGenerationRef = useRef(0)
  const candidateFeedbackDraftIdRef = useRef<string | null>(
    initialCandidateFeedbackDraft
      ? initialCandidateFeedbackDraft.id
      : null
  )
  const confirmedHistoryIdRef = useRef<string | null>(null)
  const selectionSignature = session.selectedTiles
    .map(tile => `${tile.boardId}:${tile.id}`)
    .join('|')
  const selectionSignatureRef = useRef(selectionSignature)
  selectionSignatureRef.current = selectionSignature
  speechRateRef.current = speechRate
  playbackOutputRef.current = session.selectedTiles
  const candidateSignature = session.pipeline.candidateSentences.join('\u001f')
  const candidateFeedbackSignatureRef = useRef(candidateSignature)
  const selectedSentence = getSelectedExpressionSentence(session.pipeline)
  const activeBoard = getActiveNavigationBoard(boards, boardNavigation)
  const visibleTiles = sortPictogramsForDisplay(
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
  useEffect(() => {
    if (candidateFeedbackSignatureRef.current === candidateSignature) return

    candidateFeedbackSignatureRef.current = candidateSignature
    const draftId = candidateFeedbackDraftIdRef.current
    if (draftId) onDiscardCandidateFeedbackDraft(draftId)
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
        rate: speechRateRef.current
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
    }
  }

  if (!candidateAutoplayControllerRef.current) {
    candidateAutoplayControllerRef.current =
      createCandidateAutoplayController({
        setTimer: (callback, delay) => setTimeout(callback, delay),
        clearTimer: timer => clearTimeout(timer),
        playCandidates: playCandidateQueue,
        stopPlayback: () => stopSpeechPlayback(false)
      })
  }

  useEffect(() => {
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.schedule(
        session.pipeline.candidateSentences,
        candidateAutoplayDelaySeconds
      )
    }
  }, [
    candidateAutoplayDelaySeconds,
    candidateSignature,
    selectionSignature,
    session.pipeline.candidateSentences
  ])

  useEffect(() => () => {
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.cancel({ stopActivePlayback: false })
    }
    speechGenerationRef.current += 1
    isSpeakingRef.current = false
    aiGenerationRef.current += 1
    stopExpressionPlayback(wechatSpeechPort, wechatTileAudioPort)
  }, [])

  const handlePatientInteraction = () => {
    const controller = candidateAutoplayControllerRef.current
    const cancelled = controller
      ? controller.cancel({ stopActivePlayback: false })
      : null
    if ((cancelled && cancelled.hadActive) || isSpeakingRef.current) {
      stopSpeechPlayback()
    }
  }

  const handleEditSelectedTile = (
    action: ExpressionSessionAction,
    message: string
  ) => {
    handlePatientInteraction()
    dispatch(action)
    setNotice(message)
  }

  const handleAddTile = (tile: BoardDTO['tiles'][number]) => {
    if (session.selectedTiles.length >= MAX_EXPRESSION_TILES) {
      setNotice(`一次最多选择 ${MAX_EXPRESSION_TILES} 张图片。`)
      return
    }

    onPictogramUsed(tile.boardId, tile.id)
    dispatch({ type: 'add-tile', tile })
    setNotice(`已加入「${tile.label}」。`)
  }

  const handleConfirm = () => {
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
    setNotice('表达已确认，并保存到微信本地存储。')
  }

  const handleSpeech = async () => {
    if (!selectedSentence) {
      setNotice('请先选择图片并生成句子。')
      return
    }

    const controller = candidateAutoplayControllerRef.current
    if (controller) controller.cancel()
    await playCandidateQueue([selectedSentence])
  }

  const handlePlayAllCandidates = async () => {
    const controller = candidateAutoplayControllerRef.current
    if (controller) controller.cancel()
    await playCandidateQueue(session.pipeline.candidateSentences)
  }

  const handleStopSpeech = () => {
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.cancel({ stopActivePlayback: false })
    }
    stopSpeechPlayback(false)
    setNotice('已停止朗读并取消自动播报。')
  }

  const handleSelectCandidate = async (sentence: string, index: number) => {
    const controller = candidateAutoplayControllerRef.current
    if (controller) controller.cancel()
    dispatch({ type: 'select-candidate', index })
    await playCandidateQueue([sentence])
  }

  const handleCandidateFeedback = (
    candidateIndex: number,
    feedback: 'up' | 'down'
  ) => {
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
    const savedPhrase = buildExpressionSavedPhraseEntry(session.pipeline)
    if (!savedPhrase) {
      setNotice('请先选择图片并生成一句话。')
      return
    }

    setNotice(
      onSavePhrase(savedPhrase)
        ? '已收藏为常用语，下次可以一键使用。'
        : '常用语保存失败，请稍后再试。'
    )
  }

  const handleReusePhrase = (item: CommunicationSavedPhraseEntry) => {
    if (!onReusePhrase(item)) {
      setNotice('这条常用语引用的图片已不存在，暂时无法使用。')
      return
    }

    setNotice(`已载入常用语「${item.sentence}」。`)
  }

  const handleShareExpression = async () => {
    if (!selectedSentence) {
      setNotice('请先选择一句话再分享。')
      return
    }

    setNotice('正在准备分享…')
    const result =
      await taroCommunicationSharePort.shareExpressionText(selectedSentence)
    setNotice(result.message)
  }

  const handlePlaySavedPhrase = async (
    item: CommunicationSavedPhraseEntry
  ) => {
    handlePatientInteraction()
    setPlaybackPhrase(item)
    onUseSavedPhrase(item)
    setNotice(`正在播报常用语「${item.sentence}」。`)
    await playCandidateQueue([item.sentence], item.output)
  }

  const handleReplaySavedPhrase = async () => {
    if (!playbackPhrase) return
    handlePatientInteraction()
    await playCandidateQueue(
      [playbackPhrase.sentence],
      playbackPhrase.output
    )
  }

  const handleCloseSavedPhrasePlayback = () => {
    const controller = candidateAutoplayControllerRef.current
    if (controller) {
      controller.cancel({ stopActivePlayback: false })
    }
    stopSpeechPlayback(false)
    setPlaybackPhrase(null)
    setNotice('常用语播报已完成，当前表达保持不变。')
  }

  const handleGenerateAiCandidates = async () => {
    const request = buildCommunicationAiSentenceRequest({
      output: session.pipeline.outputSnapshot,
      context: conversationContext,
      candidateCount: 3
    })
    if (!request.pictogramLabels.length) {
      setNotice('请先选择图片，再使用 AI 优化候选句。')
      return
    }

    const generation = ++aiGenerationRef.current
    const requestedSignature = selectionSignature
    setIsGeneratingAi(true)
    setNotice('正在请求 AI 候选句，本地候选仍然可用。')
    const result = await taroCommunicationAiPort.generateSentences({
      pictogramLabels: request.pictogramLabels,
      candidateCount: request.candidateCount,
      recentSentences: request.context.recentSentences,
      candidateFeedback: request.context.candidateFeedback,
      scene: request.context.scene
    })
    if (
      generation !== aiGenerationRef.current ||
      requestedSignature !== selectionSignatureRef.current
    ) {
      return
    }

    setIsGeneratingAi(false)
    if (!result.ok || !result.value) {
      setNotice(result.message)
      return
    }

    dispatch({ type: 'apply-ai-candidates', response: result.value })
    setNotice(result.message)
  }

  return (
    <View
      className='workspace workspace--expression'
      onTouchStart={handlePatientInteraction}
    >
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
                  <PictogramImage
                    className='expression-chip__image'
                    src={tile.image}
                    label={tile.label}
                    mediaType={tile.mediaType}
                    video={tile.video}
                  />
                  <Text>{tile.label}</Text>
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
            action={PATIENT_ACTION_IDS.undo}
            className='button button--quiet'
            disabled={!session.selectedTiles.length}
            onClick={() => dispatch({ type: 'remove-last' })}
            label='撤回'
            ariaLabel='撤回最后一张图片'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.clear}
            id='expression-clear-button'
            className='button button--quiet'
            disabled={!session.selectedTiles.length}
            onClick={() => dispatch({ type: 'clear' })}
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
            点分类进入子板，点图片加入表达，可重复选择
          </Text>
        </View>

        <BoardNavigator
          boards={boards}
          state={boardNavigation}
          onChange={setBoardNavigation}
        />

        <View className='tile-grid'>
          {visibleTiles.map(tile => (
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
          ))}
        </View>
      </View>

      <SavedPhrasesPanel
        items={savedPhrases}
        onReuse={handleReusePhrase}
        onPlay={handlePlaySavedPhrase}
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
          {session.pipeline.candidateSentences.length ? (
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
          {candidateAutoplayDelaySeconds
            ? `${candidateAutoplayDelaySeconds} 秒无操作后自动播报全部候选句；触摸或滚动可取消。`
            : '候选句自动播报已关闭，可手动选择一句或全部播报。'}
        </Text>

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
            disabled={!session.selectedTiles.length || isGeneratingAi}
            onClick={() => void handleGenerateAiCandidates()}
            label={isGeneratingAi ? '生成中' : '优化'}
            ariaLabel={
              isGeneratingAi ? '正在生成候选句' : 'AI 优化候选句'
            }
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.confirm}
            id='expression-confirm-button'
            className='button button--primary'
            onClick={handleConfirm}
            label='确认'
            ariaLabel='确认并保存当前表达'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.play}
            className='button button--outline'
            disabled={!selectedSentence || isSpeaking}
            onClick={handleSpeech}
            label={isSpeaking ? '朗读中' : '朗读'}
            ariaLabel={isSpeaking ? '正在朗读当前句子' : '朗读当前句子'}
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.playAll}
            className='button button--outline'
            disabled={!session.pipeline.candidateSentences.length || isSpeaking}
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
            disabled={!selectedSentence}
            onClick={handleSavePhrase}
            label='收藏'
            ariaLabel='收藏当前句子为常用语'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.share}
            id='expression-share-button'
            className='button button--outline'
            disabled={!selectedSentence}
            onClick={() => void handleShareExpression()}
            label='分享'
            ariaLabel='复制分享当前句子'
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


