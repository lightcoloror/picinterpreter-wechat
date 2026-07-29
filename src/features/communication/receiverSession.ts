import type { BoardDTO } from '@cboard-communication-core/dto'
import type { ReceiverCorrectionMemory } from '@cboard-communication-core/correctionMemory'
import {
  getReceiverPatientFeedbackCaregiverNotice,
  type ReceiverPatientFeedback
} from '@cboard-communication-core/receiverPatientFeedback'
import {
  applyMissingTokenResolutions,
  filterMissingTokenResolutionsByCorrectionMemory
} from '@cboard-communication-core/missingTokens'
import type { MissingTokenRecord } from '@cboard-communication-core/repository'
import type {
  ReceiverDraftEntry
} from '@cboard-communication-core/receiverLifecycle'
import {
  buildReceiverHistoryEntry,
  buildReceiverLoopState,
  buildReceiverMatchQuality,
  buildReceiverOutputPreview,
  createReceiverReviewId,
  deleteReceiverReviewItem,
  insertReceiverReviewItem,
  moveReceiverReviewItem,
  replaceReceiverReviewItem,
  restoreReceiverLoopState,
  type ReceiverHistoryEntry,
  type ReceiverMatchQuality,
  type ReceiverReviewItem
} from '@cboard-communication-core/receiverPipeline'
import {
  formatCommunicationSegmentation,
  parseCommunicationSegmentationInput
} from '@cboard-communication-core/segmentation'
import {
  buildCommunicationTileCatalog,
  type CommunicationCatalogItem,
  type CommunicationOutputItem
} from '@cboard-communication-core/symbolMatching'

export interface ReceiverSessionState {
  inputText: string
  segments: string[]
  reviewItems: ReceiverReviewItem[]
  outputPreview: CommunicationOutputItem[]
  quality: ReceiverMatchQuality
  matched: boolean
}

interface ReceiverSessionOptions {
  preSegmented?: string[]
  createId?: (prefix?: string) => string
  missingTokenRecords?: MissingTokenRecord[]
  correctionMemory?: ReceiverCorrectionMemory
}

const EMPTY_QUALITY: ReceiverMatchQuality = {
  totalCount: 0,
  matchedCount: 0,
  missingCount: 0,
  partialCount: 0,
  matchRate: 0,
  needsReview: false
}
export const parseReceiverSegmentationInput =
  parseCommunicationSegmentationInput
export const formatReceiverSegmentation =
  formatCommunicationSegmentation

export function createReceiverItemId(): string {
  return createReceiverReviewId('review')
}

export interface ReceiverWorkspaceResumeState {
  session: ReceiverSessionState
  segmentationDraft: string
  activeDraft: ReceiverDraftEntry | null
  learnFromCorrections: boolean
  notice: string
}

export interface ReceiverDisplayCloseResult {
  feedback?: ReceiverPatientFeedback
  saved?: boolean
}

function rebuildReceiverSession(
  inputText: string,
  reviewItems: ReceiverReviewItem[],
  matched = true
): ReceiverSessionState {
  return {
    inputText,
    segments: reviewItems.map(item => item.token).filter(Boolean),
    reviewItems,
    outputPreview: buildReceiverOutputPreview(reviewItems),
    quality: buildReceiverMatchQuality(reviewItems),
    matched
  }
}

export function replaceReceiverReviewItems(
  state: ReceiverSessionState,
  reviewItems: ReceiverReviewItem[]
): ReceiverSessionState {
  return rebuildReceiverSession(state.inputText, reviewItems, state.matched)
}

export function createEmptyReceiverSession(inputText = ''): ReceiverSessionState {
  return {
    inputText,
    segments: [],
    reviewItems: [],
    outputPreview: [],
    quality: EMPTY_QUALITY,
    matched: false
  }
}

export function createReceiverWorkspaceResumeState(
  value: Omit<ReceiverWorkspaceResumeState, 'notice'> & {
    notice?: string
  }
): ReceiverWorkspaceResumeState {
  return {
    session: {
      ...value.session,
      segments: value.session.segments.slice(),
      reviewItems: value.session.reviewItems.slice(),
      outputPreview: value.session.outputPreview.slice(),
      quality: { ...value.session.quality }
    },
    segmentationDraft: String(value.segmentationDraft || ''),
    activeDraft: value.activeDraft,
    learnFromCorrections: Boolean(value.learnFromCorrections),
    notice: String(value.notice || '')
  }
}

export function restoreReceiverWorkspaceFromRecord(
  record: ReceiverDraftEntry | null,
  boards: BoardDTO[],
  options: { learnFromCorrections?: boolean } = {}
): ReceiverWorkspaceResumeState | null {
  const restored = restoreReceiverLoopState(record, boards)

  if (!record || !restored) {
    return null
  }

  const session: ReceiverSessionState = {
    inputText: restored.inputText,
    segments: restored.segmentation.segments.slice(),
    reviewItems: restored.reviewItems.slice(),
    outputPreview: restored.outputPreview.slice(),
    quality: buildReceiverMatchQuality(restored.reviewItems),
    matched: true
  }

  return createReceiverWorkspaceResumeState({
    session,
    segmentationDraft: formatReceiverSegmentation(session.segments),
    activeDraft: record,
    learnFromCorrections:
      typeof options.learnFromCorrections === 'boolean'
        ? options.learnFromCorrections
        : true,
    notice:
      record.recordStatus === 'confirmed'
        ? getReceiverPatientFeedbackCaregiverNotice(
            record.patientFeedback,
            { saved: true }
          )
        : '已恢复上次未完成的图片复核。'
  })
}

export function resumeReceiverWorkspaceAfterDisplay(
  state: ReceiverWorkspaceResumeState,
  result: ReceiverDisplayCloseResult = {}
): ReceiverWorkspaceResumeState {
  const notice = result.feedback
    ? getReceiverPatientFeedbackCaregiverNotice(result.feedback, {
        saved: result.saved !== false
      })
    : '已返回图片复核，可以继续修改后再次展示。'

  return {
    ...createReceiverWorkspaceResumeState(state),
    notice
  }
}

export function updateReceiverInput(
  _state: ReceiverSessionState,
  inputText: string
): ReceiverSessionState {
  return createEmptyReceiverSession(inputText)
}

export function createReceiverWorkspaceFromRecognizedText(inputText: string) {
  const normalizedText = String(inputText || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)

  return {
    session: updateReceiverInput(
      createEmptyReceiverSession(),
      normalizedText
    ),
    segmentationDraft: '',
    notice: normalizedText
      ? '识别文字已填入，可人工修改后再生成图片序列。'
      : '没有识别到有效文字，请继续手工输入。'
  }
}

export function runReceiverSession(
  inputText: string,
  boards: BoardDTO[],
  options: ReceiverSessionOptions = {}
): ReceiverSessionState {
  const normalizedInput = String(inputText || '').trim()

  if (!normalizedInput) {
    return createEmptyReceiverSession()
  }

  const result = buildReceiverLoopState(normalizedInput, boards, options)
  return rebuildReceiverSession(normalizedInput, result.reviewItems)
}

export function moveReceiverItem(
  state: ReceiverSessionState,
  itemId: string,
  offset: number
): ReceiverSessionState {
  return rebuildReceiverSession(
    state.inputText,
    moveReceiverReviewItem(state.reviewItems, itemId, offset),
    state.matched
  )
}

export function deleteReceiverItem(
  state: ReceiverSessionState,
  itemId: string
): ReceiverSessionState {
  return rebuildReceiverSession(
    state.inputText,
    deleteReceiverReviewItem(state.reviewItems, itemId),
    state.matched
  )
}

export function insertReceiverItem(
  state: ReceiverSessionState,
  afterItemId: string,
  candidate: CommunicationCatalogItem,
  itemId = createReceiverItemId()
): ReceiverSessionState {
  return rebuildReceiverSession(
    state.inputText,
    insertReceiverReviewItem(
      state.reviewItems,
      afterItemId,
      candidate,
      { itemId }
    ),
    state.matched
  )
}

export function replaceReceiverItem(
  state: ReceiverSessionState,
  itemId: string,
  candidate: CommunicationCatalogItem
): ReceiverSessionState {
  return rebuildReceiverSession(
    state.inputText,
    replaceReceiverReviewItem(state.reviewItems, itemId, candidate),
    state.matched
  )
}

export function refreshReceiverMissingItems(
  state: ReceiverSessionState,
  boards: BoardDTO[],
  missingTokenRecords: MissingTokenRecord[],
  correctionMemory?: ReceiverCorrectionMemory
): ReceiverSessionState {
  if (!state.matched || !state.quality.missingCount) {
    return state
  }

  const reviewItems = applyMissingTokenResolutions(
    state.reviewItems,
    filterMissingTokenResolutionsByCorrectionMemory(
      missingTokenRecords,
      correctionMemory
    ),
    buildCommunicationTileCatalog(boards)
  )

  if (reviewItems.every((item, index) => item === state.reviewItems[index])) {
    return state
  }

  return rebuildReceiverSession(state.inputText, reviewItems, state.matched)
}

export function getReceiverReplacementCatalog(
  boards: BoardDTO[]
): CommunicationCatalogItem[] {
  return buildCommunicationTileCatalog(boards)
}

export function buildConfirmedReceiverHistory(
  state: ReceiverSessionState
): ReceiverHistoryEntry | null {
  if (!state.matched || !state.outputPreview.length) {
    return null
  }

  return buildReceiverHistoryEntry(state.inputText, state.reviewItems)
}
