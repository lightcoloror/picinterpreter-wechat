declare module '@cboard-communication-core/expressionDraft' {
  import type { ExpressionPipelineState } from '@cboard-communication-core/expressionPipeline'
  import type { ExpressionCandidate } from '@cboard-communication-core/candidateFeedback'
  import type { CommunicationHistoryEntry, CommunicationRepository } from '@cboard-communication-core/repository'

  export interface ExpressionDraftSnapshot {
    pipeline: ExpressionPipelineState
    rejected: boolean
    candidateFeedbackEntries: ExpressionCandidate[]
    pendingAi?: {
      requestId: string
      fingerprint: string
      scope: Record<string, string>
      state?: 'unknown' | 'completed'
      body?: Record<string, unknown>
    } | null
  }
  export interface ExpressionDraftRecord {
    version: 1
    id: string
    revision: number
    scope: string
    status: 'draft' | 'cleared' | 'confirmed'
    snapshot: ExpressionDraftSnapshot
    createdAt: number
    updatedAt: number
    confirmedRecordId?: string
  }
  export type ExpressionDraft = ExpressionDraftRecord
  export interface ExpressionDraftService {
    load(): ExpressionDraftRecord | null
    getCurrent(): ExpressionDraftRecord | null
    save(snapshot: ExpressionDraftSnapshot, options?: { startNew?: boolean }): ExpressionDraftRecord
    discard(): ExpressionDraftRecord
    confirm(entry: CommunicationHistoryEntry): CommunicationHistoryEntry
  }
  export function createExpressionDraftService(options: {
    repository: CommunicationRepository
    getScopeKey?: () => string
    now?: () => number
  }): ExpressionDraftService
  export function normalizeExpressionDraftSnapshot(value: unknown): ExpressionDraftSnapshot
  export function hasResumableExpressionDraft(record: ExpressionDraftRecord | null): boolean
  export function attachExpressionDraftRequest<T extends object>(request: T, service: ExpressionDraftService): T
  export function getExpressionDraftRequestContext(request: unknown): {
    beforeDispatch(ticket: unknown): unknown
    afterResponse(ticket: unknown, completed: boolean): unknown
  } | undefined
}
