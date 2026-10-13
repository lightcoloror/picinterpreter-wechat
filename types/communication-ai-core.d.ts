declare module '@cboard-communication-core/expressionPipeline' {
  interface ExpressionPipelineState {
    candidateProvider?: string
    isOfflineFallback?: boolean
  }
}

declare module '@cboard-communication-core/communicationAi' {
  import type { ReceiverCorrectionMemory } from '@cboard-communication-core/correctionMemory'
  import type { BoardDTO } from '@cboard-communication-core/dto'
  import type { ExpressionPipelineState } from '@cboard-communication-core/expressionPipeline'
  import type {
    ReceiverMatchQuality,
    ReceiverReviewItem
  } from '@cboard-communication-core/receiverPipeline'
  import type { MissingTokenRecord } from '@cboard-communication-core/repository'

  export interface CommunicationAiSentenceRequest {
    contractVersion: 1
    pictogramLabels: string[]
    candidateCount: number
    context: {
      recentSentences: string[]
      candidateFeedback: Array<{
        sentence: string
        feedback: 'up' | 'down'
      }>
      scene?: import('@cboard-communication-core/conversationSession').ConversationScene
    }
  }

  export interface CommunicationAiSentenceResponse {
    candidates: string[]
    provider?: string
  }

  export interface CommunicationAiResegmentRequest {
    contractVersion: 2
    text: string
    unmatchedTokens: string[]
    pictogramVocabulary: string[]
  }

  export interface CommunicationAiResegmentResponse {
    contractVersion: 2
    sourceText: string
    offsetUnit: 'unicode-code-point'
    tokens: string[]
    segments: Array<{ start: number; end: number; surface: string }>
    requiresConfirmation: true
    provider: string
  }
  export function validateResegmentSource(text: unknown): boolean
  export function normalizeResegmentResponse(
    text: string,
    response: unknown
  ): CommunicationAiResegmentResponse | null

  export function buildCommunicationAiSentenceRequest(input: {
    output: Array<{ label?: string }>
    context?: {
      scene?: import('@cboard-communication-core/conversationSession').ConversationScene
      turns?: Array<{
        text?: string
        sentence?: string
        inputText?: string
        recordStatus?: string
        candidateFeedback?: Array<{
          sentence: string
          feedback: 'up' | 'down' | null
        }>
      }>
    }
    candidateCount?: number
  }): CommunicationAiSentenceRequest

  export function applyCommunicationAiSentenceResponse(
    state: ExpressionPipelineState,
    response: CommunicationAiSentenceResponse,
    candidateCount?: number
  ): ExpressionPipelineState

  export function buildCommunicationAiResegmentRequest(input: {
    text: string
    reviewItems: ReceiverReviewItem[]
    boards: BoardDTO[]
    intl?: unknown
  }): CommunicationAiResegmentRequest

  export function applyCommunicationAiResegmentation(input: {
    currentReviewItems: ReceiverReviewItem[]
    response: unknown
    text: string
    boards: BoardDTO[]
    intl?: unknown
    missingTokenRecords?: MissingTokenRecord[]
    correctionMemory?: ReceiverCorrectionMemory
    createId?: (prefix?: string) => string
  }): {
    applied: boolean
    reviewItems: ReceiverReviewItem[]
    quality: ReceiverMatchQuality
    segmentation?: string[]
    provider?: string
    reason?: 'source-mismatch'
    requiresConfirmation?: true
    sourceText?: string
    segments?: CommunicationAiResegmentResponse['segments']
  }
}
