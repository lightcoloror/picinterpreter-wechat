declare module '@cboard-communication-core/savedPhraseUse' {
  import type { CommunicationRepository, CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
  export interface SavedPhraseUndoState { count: number; operationId: string | null }
  export interface SavedPhraseUndoResult extends SavedPhraseUndoState {
    changed: boolean; item?: CommunicationSavedPhraseEntry; items: CommunicationSavedPhraseEntry[]
  }
  export function filterSavedPhrasesByText(items: CommunicationSavedPhraseEntry[], query?: string): CommunicationSavedPhraseEntry[]
  export function clearSavedPhraseUndoSession(options?: { preserveGallery?: boolean }): void
  export function createSavedPhraseUndoService(options: {
    repository: CommunicationRepository; getScopeKey?: () => string; now?: () => number; canManage?: () => boolean
  }): {
    state(): SavedPhraseUndoState
    clear(): void
    delete(id: string): SavedPhraseUndoResult
    undo(operationId: string): SavedPhraseUndoResult
  }
}
