declare module '@cboard-communication-core/repository' {
  interface CommunicationSavedPhraseEntry {
    id?: string
    usageCount?: number
    lastUsedAt?: number
    updatedAt?: number
    baseVersion?: number
    serverVersion?: number
    conflicted?: boolean
  }

  interface CommunicationHistoryEntry {
    isFavorite?: boolean
    localOnly?: boolean
    importSource?: 'open-board-log'
  }

  interface CommunicationRepository {
    overwriteCommunicationHistory(entries: CommunicationHistoryEntry[]): void
    overwriteCommunicationSavedPhrases(
      entries: CommunicationSavedPhraseEntry[]
    ): CommunicationSavedPhraseEntry[]
    deleteCommunicationSavedPhrase(
      id: string,
      options?: { deletedBy?: string }
    ): CommunicationSavedPhraseTombstone | null
    loadCommunicationSavedPhraseTombstones():
      CommunicationSavedPhraseTombstone[]
  }

  interface CommunicationSavedPhraseTombstone {
    id: string
    deletedAt: number
    deletedBy?: string
    serverVersion: number
    pending?: boolean
  }
}

declare module '@cboard-communication-core/savedPhraseManagement' {
  import type {
    CommunicationSavedPhraseEntry
  } from '@cboard-communication-core/repository'
  import type { TileDTO } from '@cboard-communication-core/dto'

  export interface SavedPhraseChangeResult {
    changed: boolean
    reason?: string
    item: CommunicationSavedPhraseEntry | null
    items: CommunicationSavedPhraseEntry[]
  }

  export function addCommunicationSavedPhrase(
    entries: CommunicationSavedPhraseEntry[],
    draft: Record<string, unknown>,
    options?: { now?: () => number; createId?: (prefix: string) => string }
  ): SavedPhraseChangeResult
  export function renameCommunicationSavedPhrase(
    entries: CommunicationSavedPhraseEntry[],
    id: string,
    sentence: string,
    options?: { now?: () => number }
  ): SavedPhraseChangeResult
  export function deleteCommunicationSavedPhrase(
    entries: CommunicationSavedPhraseEntry[],
    id: string
  ): { changed: boolean; items: CommunicationSavedPhraseEntry[] }
  export function markCommunicationSavedPhraseUsed(
    entries: CommunicationSavedPhraseEntry[],
    id: string,
    options?: { now?: () => number }
  ): SavedPhraseChangeResult
  export function getCommunicationQuickPhrases(
    entries: CommunicationSavedPhraseEntry[],
    limit?: number
  ): CommunicationSavedPhraseEntry[]
  export function buildCommunicationSavedPhraseExport(
    entries: CommunicationSavedPhraseEntry[],
    options?: { now?: () => number; appId?: string }
  ): Record<string, unknown>
  export function importCommunicationSavedPhrases(
    input: string | Record<string, unknown>,
    entries: CommunicationSavedPhraseEntry[],
    options?: {
      availableTileIds?: Set<string>
      resolveTile?: (id: string) => TileDTO | null
      maxItems?: number
      now?: () => number
    }
  ):
    | {
        ok: true
        items: CommunicationSavedPhraseEntry[]
        addedCount: number
        skippedCount: number
        missingPictogramCount: number
      }
    | {
        ok: false
        error: string
        items: CommunicationSavedPhraseEntry[]
        addedCount: 0
        skippedCount: 0
        missingPictogramCount: 0
      }
}

declare module '@cboard-communication-core/historyManagement' {
  import type {
    CommunicationHistoryEntry
  } from '@cboard-communication-core/repository'

  export const OPEN_BOARD_LOG_FORMAT: string
  export const OPEN_BOARD_LOG_NOTICE: string
  export const OPEN_BOARD_LOG_ANONYMIZATIONS: string[]
  export function normalizeManagedCommunicationHistory(
    entries: CommunicationHistoryEntry[],
    options?: { limit?: number }
  ): CommunicationHistoryEntry[]
  export function toggleCommunicationHistoryFavorite(
    entries: CommunicationHistoryEntry[],
    id: string,
    options?: { now?: () => number }
  ): {
    changed: boolean
    item: CommunicationHistoryEntry | null
    items: CommunicationHistoryEntry[]
  }
  export function updateCommunicationHistoryCandidateFeedback(
    entries: CommunicationHistoryEntry[],
    id: string,
    candidateIndex: number,
    feedback: 'up' | 'down',
    options?: { now?: () => number }
  ): {
    changed: boolean
    item: CommunicationHistoryEntry | null
    items: CommunicationHistoryEntry[]
  }
  export function deleteCommunicationHistoryEntry(
    entries: CommunicationHistoryEntry[],
    id: string
  ): { changed: boolean; items: CommunicationHistoryEntry[] }
  export function clearCommunicationHistory(): CommunicationHistoryEntry[]
  export function getCommunicationHistoryReplayText(
    entry: CommunicationHistoryEntry
  ): string
  export function getCommunicationHistoryPatientFeedbackText(
    entry: CommunicationHistoryEntry
  ): string
  export function buildCommunicationHistoryExportText(
    entries: CommunicationHistoryEntry[],
    options?: { now?: () => number; title?: string }
  ): string
  export function buildCommunicationHistoryOpenBoardLog(
    entries: CommunicationHistoryEntry[],
    options?: {
      now?: (() => number) | number
      locale?: string
      source?: string
      userId?: string
    }
  ): string
  export function buildCommunicationHistoryAnonymizedOpenBoardLog(
    entries: CommunicationHistoryEntry[],
    options?: {
      now?: (() => number) | number
      locale?: string
      source?: string
      userId?: string
      random?: () => number
    }
  ): string
  export interface OpenBoardLogImportResult {
    ok: boolean
    error?: string
    items: CommunicationHistoryEntry[]
    addedCount: number
    skippedCount: number
    duplicateCount: number
    invalidEventCount: number
    unsupportedEventCount: number
    capacitySkippedCount: number
    anonymized: boolean
  }
  export function importCommunicationHistoryOpenBoardLog(
    input: string | Record<string, unknown>,
    entries: CommunicationHistoryEntry[],
    options?: {
      maxItems?: number
      maxInputLength?: number
      maxSessions?: number
      maxEvents?: number
    }
  ): OpenBoardLogImportResult
}
