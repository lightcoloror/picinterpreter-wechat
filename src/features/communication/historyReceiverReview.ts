import type { BoardDTO } from '@cboard-communication-core/dto'
import type { CommunicationHistoryEntry } from '@cboard-communication-core/repository'
import {
  buildReceiverCorrectionFromHistoryEdit,
  getEffectiveReceiverHistoryEntry,
  type ReceiverCorrectionEntry,
  type ReceiverDraftEntry
} from '@cboard-communication-core/receiverLifecycle'
import {
  restoreReceiverLoopState,
  type ReceiverReviewItem
} from '@cboard-communication-core/receiverPipeline'

export interface HistoryReceiverReviewState {
  record: ReceiverDraftEntry
  reviewItems: ReceiverReviewItem[]
}

export function createHistoryReceiverReviewState(
  record: CommunicationHistoryEntry,
  corrections: ReceiverCorrectionEntry[],
  boards: BoardDTO[]
): HistoryReceiverReviewState | null {
  if (
    record.direction !== 'receive' ||
    record.recordStatus !== 'confirmed' ||
    !record.id
  ) {
    return null
  }

  const confirmed = record as ReceiverDraftEntry
  const effective = getEffectiveReceiverHistoryEntry(
    confirmed,
    corrections
  )
  const restored = restoreReceiverLoopState(effective, boards)

  return restored
    ? { record: confirmed, reviewItems: restored.reviewItems }
    : null
}

export function buildHistoryReceiverReviewCorrection(
  state: HistoryReceiverReviewState,
  action: string,
  nextItems: ReceiverReviewItem[],
  itemId: string,
  options?: {
    now?: number | (() => number)
    createId?: (prefix?: string) => string
    isUsedForLearning?: boolean
  }
): ReceiverCorrectionEntry {
  return buildReceiverCorrectionFromHistoryEdit(
    state.record,
    action,
    state.reviewItems,
    nextItems,
    itemId,
    options
  )
}
