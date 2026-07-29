declare module '@cboard-communication-core/pictogramAttribution' {
  export interface PictogramAttribution {
    provider: string
    originalId: string
    name: string
    license: string
    licenseUrl: string | null
    author: string | null
    authorUrl: string | null
    sourceUrl: string
    repoKey: string | null
  }

  export const DEVICE_PRIVATE_PICTOGRAM_PROVIDER: 'device-private'
  export const DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE: '设备私有图片（未声明公开许可）'
  export function createDevicePrivatePictogramAttribution(
    value?: {
      boardId?: string
      tileId?: string
      originalId?: string
      name?: string
      label?: string
      license?: string
      author?: string
    }
  ): PictogramAttribution
  export function getPictogramAttribution(
    value: unknown
  ): PictogramAttribution | null
  export function normalizePublicPictogramAttribution(
    value: unknown
  ): PictogramAttribution | null
  export function formatPictogramAttribution(
    value: PictogramAttribution | null | undefined
  ): string
}

declare module '@cboard-communication-core/publicPictogramCuration' {
  import type {
    BoardDTO,
    TileDTO
  } from '@cboard-communication-core/dto'

  export const CURATED_PUBLIC_PICTOGRAM_ID_PREFIX: string

  export interface CuratedPublicPictogramEntry {
    boardId: string
    boardName: string
    tile: TileDTO
  }

  export function listCuratedPublicPictograms(
    boards: BoardDTO[]
  ): CuratedPublicPictogramEntry[]

  export function createCuratedPublicPictogram(
    boards: BoardDTO[],
    input: {
      id: string
      targetBoardId: string
      sourceTile: TileDTO
    }
  ): {
    tile: TileDTO
    boards: BoardDTO[]
  }

  export function removeCuratedPublicPictogram(
    boards: BoardDTO[],
    boardId: string,
    tileId: string
  ): {
    removed: CuratedPublicPictogramEntry
    boards: BoardDTO[]
  } | null
}

declare module '@cboard-communication-core/dto' {
  import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'

  export interface TileDTO {
    dtoType: 'TileDTO'
    version: 1
    id: string
    boardId: string
    label: string
    vocalization: string
    image: string
    mediaType?: 'image' | 'gif' | 'video'
    video?: string
    sound?: string
    backgroundColor: string
    keyPath: string
    loadBoardId: string
    pictogramAttribution?: PictogramAttribution
    communication: {
      synonyms: string[]
      relatedTerms?: string[]
      excludeTokens: string[]
      category: string
    }
  }

  export interface BoardDTO {
    dtoType: 'BoardDTO'
    version: 1
    id: string
    name: string
    nameKey: string
    category: string
    layout: {
      columns: number
      rows: number
      tileIds: string[]
    }
    tiles: TileDTO[]
  }

  export function createBoardDTO(source: unknown, options?: unknown): BoardDTO
  export function getBoardDTOTilesInDisplayOrder(board: BoardDTO): TileDTO[]
}

declare module '@cboard-communication-core/expressionPipeline' {
  import type { TileDTO } from '@cboard-communication-core/dto'

  export interface ExpressionPipelineState {
    contractVersion: 1
    outputSignature: string
    outputSnapshot: TileDTO[]
    candidateSentences: string[]
    selectedIndex: number
  }

  export interface ExpressionHistoryEntry {
    contractVersion: 1
    direction: 'express'
    sentence: string
    labels: string[]
    output: TileDTO[]
    candidateSentences: string[]
    candidates: Array<{
      sentence: string
      feedback: 'up' | 'down' | null
    }>
    id?: string
    recordStatus?: 'draft' | 'confirmed'
  }

  export interface ExpressionSavedPhraseEntry {
    contractVersion: 1
    sentence: string
    output: TileDTO[]
  }

  export function buildExpressionLoopState(
    output: TileDTO[],
    candidateCount?: number
  ): ExpressionPipelineState
  export function buildExpressionLoopStateFromSavedPhrase(
    entry: { contractVersion?: number; sentence?: string; output?: TileDTO[] },
    candidateCount?: number
  ): ExpressionPipelineState
  export function removeExpressionOutputItem<T>(
    output: T[],
    index: number
  ): T[]
  export function moveExpressionOutputItem<T>(
    output: T[],
    index: number,
    offset: number
  ): T[]
  export function selectExpressionCandidate(
    state: ExpressionPipelineState,
    selectedIndex: number
  ): ExpressionPipelineState
  export function getSelectedExpressionSentence(
    state: ExpressionPipelineState
  ): string
  export function buildExpressionSavedPhraseEntry(
    state: ExpressionPipelineState
  ): ExpressionSavedPhraseEntry | null
  export function buildExpressionHistoryEntry(
    state: ExpressionPipelineState,
    candidates?: Array<{
      sentence: string
      feedback: 'up' | 'down' | null
    }>
  ): ExpressionHistoryEntry | null
  export function persistExpressionHistoryEntry<T>(
    entry: ExpressionHistoryEntry,
    persist: (entry: ExpressionHistoryEntry) => T
  ): T | null
}

declare module '@cboard-communication-core/expressionPlayback' {
  import type { TileDTO } from '@cboard-communication-core/dto'

  export const EXPRESSION_PLAYBACK_FRAME_TYPES: {
    speech: 'speech'
    audio: 'audio'
  }
  export type ExpressionPlaybackFrame =
    | { type: 'speech'; text: string }
    | {
        type: 'audio'
        clips: Array<{ source: string; fallbackText: string }>
      }
  export function createExpressionPlaybackFrames(
    output: TileDTO[]
  ): ExpressionPlaybackFrame[]
  export function canUseTileAudioForSentence(
    output: TileDTO[],
    sentence: string
  ): boolean
}

declare module '@cboard-communication-core/pictogramMetadataSuggestion' {
  import type {
    BoardDTO,
    TileDTO
  } from '@cboard-communication-core/dto'

  export interface PictogramMetadataSuggestion {
    label: string
    synonyms: string[]
    category: string
    provider: string
    sourceStored: boolean
  }

  export function normalizePictogramMetadataSuggestion(
    value: unknown
  ): PictogramMetadataSuggestion | null
  export function buildPersonalPictogramTileDTO(value: {
    id: string
    boardId: string
    image: string
    label: string
    vocalization?: string
    sound?: string
    synonyms?: string | string[]
    category?: string
    author?: string
    license?: string
  }): TileDTO
  export function appendPersonalPictogramToBoard(
    boards: BoardDTO[],
    boardId: string,
    tile: TileDTO
  ): BoardDTO[]
  export function movePersonalPictogramInBoard(
    boards: BoardDTO[],
    boardId: string,
    tileId: string,
    direction: 'earlier' | 'later'
  ): BoardDTO[]
  export function copyPersonalPictogramToBoard(
    boards: BoardDTO[],
    sourceBoardId: string,
    tileId: string,
    targetBoardId: string,
    copiedTileId: string
  ): {
    source: {
      boardId: string
      boardName: string
      tile: TileDTO
    }
    tile: TileDTO
    boards: BoardDTO[]
  }
  export function updatePersonalPictogramInBoards(
    boards: BoardDTO[],
    sourceBoardId: string,
    targetBoardId: string,
    tile: TileDTO
  ): BoardDTO[]
  export function removePersonalPictogramFromBoard(
    boards: BoardDTO[],
    boardId: string,
    tileId: string
  ): BoardDTO[]
}

declare module '@cboard-communication-core/boardManagement' {
  import type { BoardDTO } from '@cboard-communication-core/dto'

  export const PERSONAL_COMMUNICATION_BOARD_ID_PREFIX: string
  export const PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX: string

  export function isPersonalCommunicationBoard(
    board: Pick<BoardDTO, 'id'> | null | undefined
  ): boolean

  export function createPersonalCommunicationBoard(
    boards: BoardDTO[],
    input: {
      id: string
      name: string
      columns?: number
    }
  ): {
    board: BoardDTO
    boards: BoardDTO[]
  }

  export function renamePersonalCommunicationBoard(
    boards: BoardDTO[],
    boardId: string,
    name: string
  ): BoardDTO[]

  export function moveCommunicationBoard(
    boards: BoardDTO[],
    boardId: string,
    direction: 'up' | 'down'
  ): BoardDTO[]

  export function wouldCreateCommunicationBoardLinkCycle(
    boards: BoardDTO[],
    sourceBoardId: string,
    targetBoardId: string
  ): boolean

  export function addCommunicationBoardLink(
    boards: BoardDTO[],
    input: {
      sourceBoardId: string
      targetBoardId: string
      tileId: string
      image?: string
      backgroundColor?: string
    }
  ): {
    tile: import('@cboard-communication-core/dto').TileDTO
    boards: BoardDTO[]
  }

  export function addPersonalCommunicationBoardLink(
    boards: BoardDTO[],
    input: {
      sourceBoardId: string
      targetBoardId: string
      tileId: string
      image?: string
      backgroundColor?: string
    }
  ): {
    tile: import('@cboard-communication-core/dto').TileDTO
    boards: BoardDTO[]
  }

  export function removePersonalCommunicationBoardLink(
    boards: BoardDTO[],
    sourceBoardId: string,
    targetBoardId: string
  ): BoardDTO[]

  export function removeCommunicationBoardLink(
    boards: BoardDTO[],
    sourceBoardId: string,
    targetBoardId: string
  ): BoardDTO[]

  export function removePersonalCommunicationBoard(
    boards: BoardDTO[],
    boardId: string
  ): BoardDTO[]
}

declare module '@cboard-communication-core/symbolMatching' {
  import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
  import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'

  export interface CommunicationCatalogItem {
    id: string
    tile: TileDTO
    boardId: string
    boardName: string
    displayLabel: string
    labels: string[]
    synonyms: string[]
    excludeTokens: string[]
    semanticDomain: string | null
    pictogramAttribution?: PictogramAttribution
  }

  export interface CommunicationOutputItem {
    id: string
    image: string
    mediaType?: 'image' | 'gif' | 'video'
    video?: string
    label: string
    vocalization: string
    keyPath?: string
    backgroundColor?: string
    attribution?: PictogramAttribution
  }

  export function buildCommunicationTileCatalog(
    boards: BoardDTO[],
    intl?: unknown
  ): CommunicationCatalogItem[]
}

declare module '@cboard-communication-core/matchingDiagnostics' {
  import type { BoardDTO } from '@cboard-communication-core/dto'
  import type {
    ReceiverCorrectionMemory
  } from '@cboard-communication-core/correctionMemory'

  export interface CommunicationMatchingDiagnosticItem {
    token: string
    matched: boolean
    matchType: string
    pictogramId: string | null
    boardId: string | null
    boardName: string
    label: string
    image: string
    keyPath: string
    backgroundColor: string
  }

  export interface CommunicationMatchingDiagnosticResult {
    inputText: string
    segmentation: {
      segments: string[]
      engine: string
    }
    items: CommunicationMatchingDiagnosticItem[]
    matchedCount: number
    totalCount: number
    matchRate: number
    unmatchedTokens: string[]
    elapsedMs: number
  }

  export const COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH: 120
  export const COMMUNICATION_MATCHING_DIAGNOSTIC_EXAMPLES: string[]
  export function analyzeCommunicationMatching(
    text: string,
    boards: BoardDTO[],
    options?: {
      correctionMemory?: ReceiverCorrectionMemory
      intl?: unknown
      preSegmented?: string[]
      now?: number | (() => number)
    }
  ): CommunicationMatchingDiagnosticResult
}

declare module '@cboard-communication-core/candidateFeedback' {
  export type CandidateFeedback = 'up' | 'down' | null

  export interface ExpressionCandidate {
    sentence: string
    feedback: CandidateFeedback
  }

  export interface ExpressionCandidateFeedbackDraft {
    contractVersion: 1
    id: string
    sessionId: string
    outputSignature: string
    candidates: ExpressionCandidate[]
    createdAt: number
    updatedAt: number
  }

  export const CANDIDATE_FEEDBACK: {
    up: 'up'
    down: 'down'
  }
  export function normalizeExpressionCandidates(
    value: unknown,
    fallbackSentences?: string[]
  ): ExpressionCandidate[]
  export function findExpressionCandidateFeedbackDraft(
    value: unknown,
    options?: {
      sessionId?: string
      outputSignature?: string
      candidateSentences?: string[]
    }
  ): ExpressionCandidateFeedbackDraft | null
  export function toggleExpressionCandidateFeedback(
    candidates: ExpressionCandidate[],
    candidateIndex: number,
    feedback: CandidateFeedback
  ): ExpressionCandidate[]
}

declare module '@cboard-communication-core/correctionMemory' {
  import type { ReceiverCorrectionEntry } from '@cboard-communication-core/receiverLifecycle'

  export interface ReceiverCorrectionMemoryRule {
    token: string
    preferredPictogramId: string | null
    blockedPictogramIds: string[]
    tombstones: Array<{
      pictogramId: string
      createdAt: number
      expiresAt: number
    }>
    frequencyCount: number
    recencyWeight: number
    score: number
    lastCorrectedAt: number
  }

  export interface ReceiverCorrectionMemory {
    contractVersion: 1
    scope: 'workspace-local'
    workspaceId: string
    generatedAt: number
    rules: ReceiverCorrectionMemoryRule[]
  }

  export interface CorrectionMemoryManagementRow {
    token: string
    preferredPictogramId: string | null
    preferredLabel: string | null
    blockedPictogramIds: string[]
    blockedLabels: string[]
    frequencyCount: number
    lastCorrectedAt: number
  }

  export function buildWorkspaceCorrectionMemory(
    corrections: ReceiverCorrectionEntry[],
    options: {
      workspaceId: string
      now?: number | (() => number)
      tombstoneRetentionMs?: number
    }
  ): ReceiverCorrectionMemory

  export function disableWorkspaceCorrectionMemoryToken(
    corrections: ReceiverCorrectionEntry[],
    options: {
      workspaceId: string
      token: string
    }
  ): {
    changed: boolean
    disabledCount: number
    items: ReceiverCorrectionEntry[]
  }

  export function buildCorrectionMemoryManagementRows(
    correctionMemory: ReceiverCorrectionMemory,
    catalog: unknown[]
  ): CorrectionMemoryManagementRow[]
}

declare module '@cboard-communication-core/personalImagePreferences' {
  import type { BoardDTO } from '@cboard-communication-core/dto'

  export interface PersonalImagePreference {
    contractVersion: 1
    scope: 'device-private'
    tileId: string
    boardId: string
    labelSnapshot: string
    image: string
    pictogramAttribution: PictogramAttribution
    patientId: string
    workspaceId: string
    createdAt: number
    updatedAt: number
  }

  export function applyPersonalImagePreferencesToBoards(
    boards: BoardDTO[],
    preferences: PersonalImagePreference[],
    identity: { patientId: string; workspaceId: string }
  ): BoardDTO[]

  export function applyPersonalImagePreferencesToItems<T extends {
    id: string
    image: string
  }>(
    items: T[],
    preferences: PersonalImagePreference[],
    identity: { patientId: string; workspaceId: string }
  ): T[]
}

declare module '@cboard-communication-core/receiverPipeline' {
  import type { ReceiverCorrectionMemory } from '@cboard-communication-core/correctionMemory'
  import type { BoardDTO } from '@cboard-communication-core/dto'
  import type { MissingTokenRecord } from '@cboard-communication-core/repository'
  import type {
    CommunicationCatalogItem,
    CommunicationOutputItem
  } from '@cboard-communication-core/symbolMatching'
  import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'

  export interface ReceiverReviewItem {
    id: string
    token: string
    tile: CommunicationCatalogItem | null
    matchType: string
    source?: string
  }

  export interface ReceiverMatchQuality {
    totalCount: number
    matchedCount: number
    missingCount: number
    partialCount: number
    matchRate: number
    needsReview: boolean
  }

  export interface ReceiverHistoryEntry {
    contractVersion: 1 | 2
    direction: 'receive'
    inputText: string
    labels: string[]
    output: CommunicationOutputItem[]
    pictogramSequence: Array<{
      pictogramId: string | null
      label: string
      source: string
      boardId: string
      matchType: string
      confidence: number
      originalToken: string
      attribution?: PictogramAttribution
    }>
  }

  export function buildReceiverLoopState(
    text: string,
    boards: BoardDTO[],
    options?: {
      preSegmented?: string[]
      createId?: (prefix?: string) => string
      missingTokenRecords?: MissingTokenRecord[]
      correctionMemory?: ReceiverCorrectionMemory
    }
  ): {
    inputText: string
    reviewItems: ReceiverReviewItem[]
    outputPreview: CommunicationOutputItem[]
  }
  export function restoreReceiverLoopState(
    entry: ReceiverHistoryEntry | null,
    boards: BoardDTO[],
    options?: {
      createId?: (prefix?: string) => string
    }
  ): {
    inputText: string
    segmentation: {
      segments: string[]
      engine: 'persisted-receiver-record'
    }
    matches: ReceiverReviewItem[]
    reviewItems: ReceiverReviewItem[]
    missingTokens: string[]
    outputPreview: CommunicationOutputItem[]
    matchRate: number
  } | null
  export function buildReceiverMatchQuality(
    items: ReceiverReviewItem[]
  ): ReceiverMatchQuality
  export function buildReceiverOutputPreview(
    items: ReceiverReviewItem[]
  ): CommunicationOutputItem[]
  export function buildReceiverHistoryEntry(
    inputText: string,
    items: ReceiverReviewItem[]
  ): ReceiverHistoryEntry
  export function moveReceiverReviewItem(
    items: ReceiverReviewItem[],
    itemId: string,
    offset: number
  ): ReceiverReviewItem[]
  export function deleteReceiverReviewItem(
    items: ReceiverReviewItem[],
    itemId: string
  ): ReceiverReviewItem[]
  export function createReceiverReviewId(prefix?: string): string
  export function insertReceiverReviewItem(
    items: ReceiverReviewItem[],
    afterItemId: string,
    candidate: CommunicationCatalogItem,
    options?: { itemId?: string }
  ): ReceiverReviewItem[]
  export function replaceReceiverReviewItem(
    items: ReceiverReviewItem[],
    itemId: string,
    candidate: CommunicationCatalogItem
  ): ReceiverReviewItem[]
}

declare module '@cboard-communication-core/receiverLifecycle' {
  import type {
    ReceiverHistoryEntry,
    ReceiverReviewItem
  } from '@cboard-communication-core/receiverPipeline'
  import type {
    ReceiverPatientFeedback,
    ReceiverPatientFeedbackEvent
  } from '@cboard-communication-core/receiverPatientFeedback'

  export interface ReceiverDraftEntry extends ReceiverHistoryEntry {
    id: string
    sessionId: string
    patientId: string
    workspaceId: string
    recordStatus: 'draft' | 'confirmed'
    createdAt: number
    updatedAt: number
    confirmedAt?: number
    patientFeedback?: ReceiverPatientFeedback
    patientFeedbackAt?: number
    patientFeedbackEvents?: ReceiverPatientFeedbackEvent[]
  }

  export interface ReceiverCorrectionEntry {
    id: string
    expressionId: string
    sessionId: string
    patientId: string
    workspaceId: string
    userId: string | null
    context?: 'live_review' | 'caregiver_history_review'
    action: string
    originalToken: string
    normalizedToken: string
    sequenceIndexBefore: number | null
    sequenceIndexAfter: number | null
    pictogramIdBefore: string | null
    pictogramIdAfter: string | null
    pictogramIdsBefore: Array<string | null>
    pictogramIdsAfter: Array<string | null>
    revisionBefore?: ReceiverCorrectionRevision
    revisionAfter?: ReceiverCorrectionRevision
    isUsedForLearning: boolean
    createdAt: number
  }

  export interface ReceiverCorrectionRevision {
    labels: string[]
    output: Array<{
      id: string
      label: string
      image?: string
      vocalization?: string
      keyPath?: string
      backgroundColor?: string
    }>
    pictogramSequence: ReceiverHistoryEntry['pictogramSequence']
  }

  export const RECEIVER_CORRECTION_ACTIONS: {
    replace: 'replace_pictogram'
    insert: 'insert_pictogram'
    delete: 'delete_pictogram'
    reorder: 'reorder'
    resegment: 'resegment'
  }

  export const RECEIVER_CORRECTION_CONTEXTS: {
    liveReview: 'live_review'
    caregiverHistoryReview: 'caregiver_history_review'
  }

  export function buildReceiverCorrectionFromEdit(
    draft: ReceiverDraftEntry,
    action: string,
    beforeItems: ReceiverReviewItem[],
    afterItems: ReceiverReviewItem[],
    itemId: string,
    options?: {
      now?: number | (() => number)
      createId?: (prefix?: string) => string
      isUsedForLearning?: boolean
    }
  ): ReceiverCorrectionEntry

  export function buildReceiverCorrectionFromHistoryEdit(
    record: ReceiverDraftEntry,
    action: string,
    beforeItems: ReceiverReviewItem[],
    afterItems: ReceiverReviewItem[],
    itemId: string,
    options?: {
      now?: number | (() => number)
      createId?: (prefix?: string) => string
      isUsedForLearning?: boolean
    }
  ): ReceiverCorrectionEntry

  export function getEffectiveReceiverHistoryEntry(
    record: ReceiverDraftEntry,
    corrections: ReceiverCorrectionEntry[]
  ): ReceiverDraftEntry & {
    receiverHistoryRevision?: {
      correctionId: string
      createdAt: number
    }
  }
}

declare module '@cboard-communication-core/receiverPatientFeedback' {
  export type ReceiverPatientFeedback =
    | 'understood'
    | 'not_understood'
    | 'repeat_requested'

  export interface ReceiverPatientFeedbackEvent {
    type: ReceiverPatientFeedback
    createdAt: number
  }

  export const RECEIVER_PATIENT_FEEDBACK: {
    understood: 'understood'
    notUnderstood: 'not_understood'
    repeatRequested: 'repeat_requested'
  }
  export const MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS: 20
  export function getReceiverPatientFeedbackLabel(
    value: unknown
  ): string
  export function getReceiverPatientFeedbackCaregiverNotice(
    value: unknown,
    options?: { saved?: boolean }
  ): string
}

declare module '@cboard-communication-core/conversationSession' {
  export type ConversationScene =
    | 'hospital'
    | 'home'
    | 'rehab_clinic'

  export interface ConversationSession {
    contractVersion: 1
    id: string
    startedAt: number
    lastActivityAt: number
    scene?: ConversationScene
  }

  export const CONVERSATION_SCENES: ReadonlyArray<{
    id: ConversationScene
    label: string
    icon: string
  }>

  export function normalizeConversationScene(
    value: unknown
  ): ConversationScene | null

  export function setConversationSessionScene(
    value: ConversationSession,
    scene: ConversationScene | null,
    options?: { now?: () => number }
  ): ConversationSession | null

  export interface ConversationContextTurn {
    id: string | null
    direction: 'express' | 'receive'
    text: string
    labels: string[]
    pictogramIds: string[]
    candidateFeedback: Array<{
      sentence: string
      feedback: 'up' | 'down'
    }>
    createdAt: number
  }

  export interface ConversationContext {
    contractVersion: 1
    sessionId: string
    scene?: ConversationScene
    turns: ConversationContextTurn[]
  }
}

declare module '@cboard-communication-core/runtimePictogram' {
  import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'

  export interface RuntimePictogramSource extends PictogramAttribution {}

  export interface RuntimePictogram {
    id: string
    label: string
    vocalization: string
    image: string
    backgroundColor: string
    source: RuntimePictogramSource
  }

  export function normalizeRuntimePictogram(
    value: unknown
  ): RuntimePictogram | null
  export const DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER: 'device-private'
  export function buildDevicePrivateRuntimePictogram(value: {
    recordId: string
    label: string
    image: string
  }): RuntimePictogram | null
  export function buildAiGeneratedRuntimePictogram(value: {
    recordId: string
    generationId: string
    label: string
    image: string
    provider: string
    model: string
  }): RuntimePictogram | null
}

declare module '@cboard-communication-core/reviewedArasaac' {
  export function getReviewedArasaacIds(token: unknown): number[]

  export function getReviewedArasaacIndexSummary(): {
    schemaVersion: number
    sourceSha256: string
    caseCount: number
    conceptCount: number
    aliasCount: number
  }

  export function getReviewedArasaacSegmentationTerms(): string[]
}

declare module '@cboard-communication-core/communicationShare' {
  import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'
  import type { CommunicationOutputItem } from '@cboard-communication-core/symbolMatching'

  export const COMMUNICATION_SHARE_CONTRACT_VERSION: 1
  export const RECEIVER_SHARE_CANVAS_WIDTH: 1080
  export const MAX_RECEIVER_SHARE_ITEMS: 40

  export interface ExpressionSharePayload {
    contractVersion: 1
    title: string
    text: string
  }

  export interface ReceiverShareItem {
    id: string
    label: string
    image: string
    attribution: PictogramAttribution | null
    attributionText: string
  }

  export interface ReceiverShareDocument {
    contractVersion: 1
    title: string
    speechText: string
    items: ReceiverShareItem[]
    attributionLines: string[]
  }

  export interface ReceiverShareLayout {
    contractVersion: 1
    width: number
    height: number
    background: string
    rectangles: Array<{
      x: number
      y: number
      width: number
      height: number
      fill: string
      stroke: string
      lineWidth: number
    }>
    imageBlocks: Array<{
      source: string
      x: number
      y: number
      width: number
      height: number
      label: string
    }>
    textBlocks: Array<{
      text: string
      x: number
      y: number
      font: string
      color: string
      maxWidth: number
      align: 'left' | 'center'
    }>
  }

  export function buildExpressionSharePayload(
    sentence: unknown
  ): ExpressionSharePayload | null

  export function buildReceiverShareDocument(
    items: CommunicationOutputItem[],
    options?: { title?: string; speechText?: string }
  ): ReceiverShareDocument | null

  export function buildReceiverShareLayout(
    document: ReceiverShareDocument | null
  ): ReceiverShareLayout | null

  export function renderReceiverShareLayout(
    context: {
      fillStyle: string
      strokeStyle: string
      lineWidth: number
      font: string
      textAlign: string
      fillRect(
        x: number,
        y: number,
        width: number,
        height: number
      ): void
      strokeRect(
        x: number,
        y: number,
        width: number,
        height: number
      ): void
      fillText(
        text: string,
        x: number,
        y: number,
        maxWidth?: number
      ): void
      drawImage(
        image: unknown,
        x: number,
        y: number,
        width: number,
        height: number
      ): void
    },
    layout: ReceiverShareLayout,
    loadImage: (source: string) => Promise<unknown>
  ): Promise<{
    loadedImageCount: number
    failedImageCount: number
  }>
}
declare module '@cboard-communication-core/missingTokens' {
  import type { ReceiverCorrectionMemory } from '@cboard-communication-core/correctionMemory'
  import type { MissingTokenRecord } from '@cboard-communication-core/repository'
  import type { ReceiverReviewItem } from '@cboard-communication-core/receiverPipeline'
  import type { RuntimePictogram } from '@cboard-communication-core/runtimePictogram'
  import type { CommunicationCatalogItem } from '@cboard-communication-core/symbolMatching'

  export const MAX_MISSING_TOKEN_SUGGESTIONS: number

  export function normalizeMissingTokenSuggestions(
    value: RuntimePictogram[] | undefined,
    legacyValue?: RuntimePictogram | null
  ): RuntimePictogram[]

  export function getMissingTokenSuggestions(
    record: Pick<MissingTokenRecord, 'suggestedPictogram' | 'suggestedPictograms'> | null | undefined
  ): RuntimePictogram[]

  export interface SafeLocalMissingTokenResolution {
    recordId: string
    normalizedToken: string
    resolvedPictogramId: string
    source: 'catalog-auto'
    reviewedByCaregiver: false
    matchType: 'exact' | 'synonym'
  }

  export function countPendingMissingTokens(
    records: MissingTokenRecord[],
    excludedRecordIds?: Set<string> | string[]
  ): number

  export function countCatalogAutoResolvedMissingTokens(
    records: MissingTokenRecord[]
  ): number

  export function findSafeLocalMissingTokenResolutions(
    records: MissingTokenRecord[],
    catalog: CommunicationCatalogItem[]
  ): SafeLocalMissingTokenResolution[]

  export function filterMissingTokenResolutionsByCorrectionMemory(
    records: MissingTokenRecord[],
    correctionMemory?: ReceiverCorrectionMemory
  ): MissingTokenRecord[]

  export function applyMissingTokenResolutions(
    reviewItems: ReceiverReviewItem[],
    records: MissingTokenRecord[],
    catalog: CommunicationCatalogItem[]
  ): ReceiverReviewItem[]
}
declare module '@cboard-communication-core/repository' {
  import type {
    ConversationContext,
    ConversationSession
  } from '@cboard-communication-core/conversationSession'
  import type { TileDTO } from '@cboard-communication-core/dto'
  import type { ExpressionSavedPhraseEntry } from '@cboard-communication-core/expressionPipeline'
  import type { CommunicationOutputItem } from '@cboard-communication-core/symbolMatching'
  import type { RuntimePictogram } from '@cboard-communication-core/runtimePictogram'
  import type { PersonalImagePreference } from '@cboard-communication-core/personalImagePreferences'
  import type {
    ReceiverCorrectionEntry,
    ReceiverDraftEntry
  } from '@cboard-communication-core/receiverLifecycle'
  import type {
    ReceiverPatientFeedback,
    ReceiverPatientFeedbackEvent
  } from '@cboard-communication-core/receiverPatientFeedback'
  import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'

  export const COMMUNICATION_REPOSITORY_SCHEMA_VERSION: number

  export interface CommunicationHistoryEntry {
    contractVersion?: number
    direction: 'express' | 'receive'
    sentence?: string
    inputText?: string
    labels: string[]
    output?: Array<TileDTO | CommunicationOutputItem>
    candidateSentences?: string[]
    candidates?: Array<{
      sentence: string
      feedback: 'up' | 'down' | null
    }>
    pictogramSequence?: Array<{
      pictogramId: string | null
      label: string
      source: string
      boardId: string
      matchType: string
      confidence: number
      originalToken: string
      attribution?: PictogramAttribution
    }>
    id?: string
    sessionId?: string
    patientId?: string
    workspaceId?: string
    recordStatus?: 'draft' | 'confirmed'
    createdAt?: number
    updatedAt?: number
    confirmedAt?: number
    baseVersion?: number
    serverVersion?: number
    conflicted?: boolean
    patientFeedback?: ReceiverPatientFeedback
    patientFeedbackAt?: number
    patientFeedbackEvents?: ReceiverPatientFeedbackEvent[]
    receiverHistoryRevision?: {
      correctionId: string
      createdAt: number
    }
  }

  export interface MissingTokenOccurrenceInput {
    tokens: string[]
    rawText: string
    scene?: string
  }

  export interface MissingTokenRecord {
    id: string
    normalizedToken: string
    status: 'new' | 'suggested' | 'resolved' | 'ignored'
    occurrenceCount: number
    scenes: string[]
    rawTextSamples: string[]
    suggestedPictogramId: string | null
    suggestedPictogram: RuntimePictogram | null
    suggestedPictograms?: RuntimePictogram[]
    source: string | null
    resolvedPictogramId: string | null
    resolvedPictogram: RuntimePictogram | null
    reviewedByCaregiver: boolean
    patientId: string
    workspaceId: string
    createdAt: number
    updatedAt: number
  }

  export interface CommunicationSavedPhraseEntry
    extends ExpressionSavedPhraseEntry {
    createdAt?: number
    baseVersion?: number
    serverVersion?: number
    conflicted?: boolean
  }

  export interface CommunicationSavedPhraseTombstone {
    id: string
    deletedAt: number
    deletedBy?: string
    serverVersion: number
    pending?: boolean
  }

  export interface AnonymousAccountMergeState {
    anonymousUserId: string
    accountUserId: string
    status: 'unlinked' | 'deferred' | 'retired'
    promptCount: number
    retiredAt: number | null
    shouldPrompt: boolean
  }

  export interface CommunicationRepository {
    appendCommunicationHistory(
      entry: CommunicationHistoryEntry
    ): CommunicationHistoryEntry
    appendReceiverCorrection(
      entry: ReceiverCorrectionEntry
    ): ReceiverCorrectionEntry | null
    confirmReceiverDraft(
      draft: ReceiverDraftEntry,
      entry: CommunicationHistoryEntry
    ): ReceiverDraftEntry
    createReceiverDraft(
      entry: CommunicationHistoryEntry
    ): ReceiverDraftEntry
    deferAnonymousUserAccountMerge(
      accountUserId: string
    ): AnonymousAccountMergeState
    getActiveConversationSession(): ConversationSession
    getAnonymousAccountMergeState(
      accountUserId: string
    ): AnonymousAccountMergeState
    loadAnonymousUserIdentity(): string
    loadCommunicationAccountIdentity(): {
      version: number
      anonymousUserId: string
      accountLinks: Array<{
        accountUserId: string
        status: 'deferred' | 'retired'
        promptCount: number
        retiredAt: number | null
        updatedAt: number
      }>
    }
    loadCommunicationIdentity(): { patientId: string; workspaceId: string }
    loadCommunicationHistory(): CommunicationHistoryEntry[]
    loadExpressionCandidateFeedbackDrafts(): import('@cboard-communication-core/candidateFeedback').ExpressionCandidateFeedbackDraft[]
    loadAllPersonalImagePreferences(): PersonalImagePreference[]
    loadCommunicationSavedPhrases(): CommunicationSavedPhraseEntry[]
    loadCommunicationSavedPhraseTombstones():
      CommunicationSavedPhraseTombstone[]
    loadResumableReceiverRecord(options?: {
      sessionId?: string
    }): ReceiverDraftEntry | null
    loadConversationContext(options?: {
      sessionId?: string
      maxTurns?: number
    }): ConversationContext
    loadMissingTokens(): MissingTokenRecord[]
    loadPersonalImagePreferences(): PersonalImagePreference[]
    overwriteMissingTokens(entries: MissingTokenRecord[]): MissingTokenRecord[]
    overwriteAllPersonalImagePreferences(
      entries: PersonalImagePreference[]
    ): PersonalImagePreference[]
    overwritePersonalImagePreferences(
      entries: PersonalImagePreference[]
    ): PersonalImagePreference[]
    recordMissingTokens(entry: MissingTokenOccurrenceInput): MissingTokenRecord[]
    recordReceiverPatientFeedback(
      recordId: string,
      feedback: ReceiverPatientFeedback
    ): CommunicationHistoryEntry | null
    retireAnonymousUserIdentity(
      accountUserId: string
    ): AnonymousAccountMergeState
    reviewMissingToken(
      recordId: string,
      review: {
        status: MissingTokenRecord['status']
        resolvedPictogramId?: string
        resolvedPictogram?: RuntimePictogram
        suggestedPictogramId?: string
        suggestedPictogram?: RuntimePictogram
        suggestedPictograms?: RuntimePictogram[]
        source?: string
      }
    ): MissingTokenRecord | null
    loadReceiverCorrections(): ReceiverCorrectionEntry[]
    loadReceiverRecords(): CommunicationHistoryEntry[]
    discardResumableReceiverRecord(
      recordId: string,
      options?: { sessionId?: string }
    ): boolean
    overwriteReceiverCorrections(
      entries: ReceiverCorrectionEntry[]
    ): ReceiverCorrectionEntry[]
    overwriteReceiverRecords(entries: CommunicationHistoryEntry[]): void
    overwriteCommunicationSavedPhrases(
      entries: CommunicationSavedPhraseEntry[]
    ): CommunicationSavedPhraseEntry[]
    overwriteCommunicationHistory(
      entries: CommunicationHistoryEntry[]
    ): void
    overwriteCommunicationSavedPhraseTombstones(
      entries: CommunicationSavedPhraseTombstone[]
    ): CommunicationSavedPhraseTombstone[]
    overwriteExpressionCandidateFeedbackDrafts(
      entries: import('@cboard-communication-core/candidateFeedback').ExpressionCandidateFeedbackDraft[]
    ): import('@cboard-communication-core/candidateFeedback').ExpressionCandidateFeedbackDraft[]
    removeExpressionCandidateFeedbackDraft(id: string): boolean
    resetConversationSession(): ConversationSession
    setConversationScene(
      scene: import('@cboard-communication-core/conversationSession').ConversationScene | null
    ): ConversationSession | null
    removePersonalImagePreference(
      tileId: string,
      options?: { boardId?: string }
    ): boolean
    saveCommunicationPhrase(
      entry: ExpressionSavedPhraseEntry
    ): CommunicationSavedPhraseEntry | null
    deleteCommunicationSavedPhrase(
      id: string,
      options?: { deletedBy?: string }
    ): CommunicationSavedPhraseTombstone | null
    clearCommunicationSavedPhrases(
      options?: { deletedBy?: string }
    ): CommunicationSavedPhraseTombstone[]
    saveExpressionCandidateFeedbackDraft(entry: {
      id?: string
      sessionId?: string
      outputSignature: string
      candidates: import('@cboard-communication-core/candidateFeedback').ExpressionCandidate[]
      createdAt?: number
    }): import('@cboard-communication-core/candidateFeedback').ExpressionCandidateFeedbackDraft | null
    savePersonalImagePreference(entry: {
      tileId: string
      boardId?: string
      labelSnapshot?: string
      image: string
    }): PersonalImagePreference | null
    updateReceiverDraft(
      draft: ReceiverDraftEntry,
      entry: CommunicationHistoryEntry
    ): ReceiverDraftEntry
  }

  export function createCommunicationRepository(options: {
    storage: {
      getItem(key: string): string | null
      setItem(key: string, value: string): void
      removeItem(key: string): void
    }
  }): CommunicationRepository
}

declare module '@cboard-communication-core/accountIdentity' {
  export const MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS: number
}

declare module '@cboard-communication-core/adapters/wechatStorage' {
  export interface WechatStorageApi {
    getStorageSync(key: string): unknown
    setStorageSync(key: string, value: string): void
    removeStorageSync?(key: string): void
  }

  export function createWechatKeyValueStore(api: WechatStorageApi): {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }
}

declare module '@cboard-communication-core/cboardConceptProfiles' {
  export interface CboardCommunicationConceptProfile {
    label: string
    synonyms: string[]
    excludeTokens: string[]
    category: string
  }

  export function getCboardCommunicationConceptProfile(
    labelKey?: string
  ): CboardCommunicationConceptProfile | null
  export function getCboardCommunicationConceptProfileLabelKeys(): string[]
}

declare module '@cboard-communication-core/segmentation' {
  export function parseCommunicationSegmentationInput(value: string): string[]
  export function formatCommunicationSegmentation(segments: string[]): string
}

declare module '@cboard-communication-core/serviceReadiness' {
  export interface CommunicationServiceReadiness {
    recognized: boolean
    ready: boolean
    status: 'ok' | 'degraded' | 'unknown'
    database: 'connected' | 'disconnected' | 'unknown'
    communicationIndexes: 'unknown' | 'building' | 'ready' | 'failed'
    privatePictureLibrary: 'configured' | 'unconfigured' | 'unknown'
  }

  export function normalizeCommunicationServiceReadiness(
    value: unknown
  ): CommunicationServiceReadiness
}

declare module '@cboard-communication-core/settingsAdapter' {
  import type {
    CommunicationHistoryEntry,
    CommunicationSavedPhraseEntry
  } from '@cboard-communication-core/repository'

  export interface CommunicationSupportSettingsValue {
    savedPhrases: CommunicationSavedPhraseEntry[]
    history: CommunicationHistoryEntry[]
  }

  export function getCommunicationSupportSettings(
    settings: Record<string, unknown>
  ): CommunicationSupportSettingsValue

  export function createCommunicationSupportSettingsPatch(
    value: CommunicationSupportSettingsValue,
    options?: { includeLegacy?: boolean }
  ): Record<string, CommunicationSupportSettingsValue>
}

declare module '@cboard-communication-core/storage' {
  import type {
    CommunicationHistoryEntry,
    CommunicationSavedPhraseEntry
  } from '@cboard-communication-core/repository'

  export interface CommunicationSupportSettingsValue {
    savedPhrases: CommunicationSavedPhraseEntry[]
    history: CommunicationHistoryEntry[]
  }

  export interface CommunicationSupportMergePreviewCollection {
    localCount: number
    remoteCount: number
    resultCount: number
    localOnly: number
    remoteOnly: number
    conflicts: number
    localWins: number
    remoteWins: number
    unchanged: number
  }

  export interface CommunicationSupportMergePreview
    extends CommunicationSupportMergePreviewCollection {
    savedPhrases: CommunicationSupportMergePreviewCollection
    history: CommunicationSupportMergePreviewCollection
  }

  export function mergeCommunicationSupportSettings(
    localValue: CommunicationSupportSettingsValue,
    remoteValue: CommunicationSupportSettingsValue
  ): CommunicationSupportSettingsValue

  export function buildCommunicationSupportMergePreview(
    localValue: CommunicationSupportSettingsValue,
    remoteValue: CommunicationSupportSettingsValue
  ): CommunicationSupportMergePreview

  export function buildCommunicationSupportCloudSettings(
    savedPhrases: CommunicationSavedPhraseEntry[],
    history: CommunicationHistoryEntry[]
  ): CommunicationSupportSettingsValue
}

declare module '@cboard-communication-core/receiverSync' {
  import type {
    CommunicationHistoryEntry
  } from '@cboard-communication-core/repository'

  export function buildConfirmedReceiverSyncPayload(
    records: CommunicationHistoryEntry[]
  ): Array<Record<string, unknown>>

  export function mergeConfirmedReceiverRecords(
    localRecords: CommunicationHistoryEntry[],
    remoteRecords: CommunicationHistoryEntry[],
    deletedRecordIds?: Array<string | { id: string }>
  ): CommunicationHistoryEntry[]

  export function removeDeletedReceiverHistory(
    history: CommunicationHistoryEntry[],
    deletedRecordIds?: Array<string | { id: string }>
  ): CommunicationHistoryEntry[]
}
