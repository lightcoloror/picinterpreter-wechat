declare module '@cboard-communication-core/receiverReading' {
  export interface ReceiverReadingSegment {
    text: string
    start: number
    end: number
    itemIndices: number[]
  }
  export const RECEIVER_READING_FALLBACK: string
  export function buildReceiverReading(inputText: string, sequence?: unknown[], items?: unknown[]): {
    segments: ReceiverReadingSegment[]
    canSegment: boolean
    reason: string
  }
}
declare module '@cboard-communication-core/receiverRepair' {
  import type { ReceiverDraftEntry } from '@cboard-communication-core/receiverLifecycle'
  import type { ReceiverHistoryEntry } from '@cboard-communication-core/receiverPipeline'
  export const RECEIVER_PARTNER_GUIDANCE: string
  export function getReceiverRepairSource(record: ReceiverDraftEntry | null | undefined, records?: unknown[]): ReceiverDraftEntry | null
  export function withReceiverRepair<T extends ReceiverHistoryEntry>(entry: T, source?: ReceiverDraftEntry | null): T
}
