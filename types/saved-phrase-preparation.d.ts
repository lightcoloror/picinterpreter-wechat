declare module '@cboard-communication-core/savedPhrasePreparation' {
  import type { CommunicationRepository, CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
  import type { ReceiverDraftEntry } from '@cboard-communication-core/receiverLifecycle'
  import type { ReceiverHistoryEntry } from '@cboard-communication-core/receiverPipeline'
  export interface PreparedPhraseDraft extends ReceiverDraftEntry {
    preparationMode?: 'edit' | 'copy'
    sourcePhraseId?: string
    sourceSnapshot?: CommunicationSavedPhraseEntry
    alignmentUnavailable?: boolean
    templateId: string
    lifeContext: string
    preparationVersion: 1
  }
  export const SAVED_PHRASE_STARTERS: { id: string; lifeContext: string; text: string }[]
  export const PREPARATION_STORAGE_KEY: string
  export interface SavedPhrasePreparationService {
    load(): PreparedPhraseDraft | null
    start(templateId: string): PreparedPhraseDraft
    startFromSavedPhrase(id: string, mode: 'edit' | 'copy'): PreparedPhraseDraft
    convertToCopy(id: string): PreparedPhraseDraft
    update(id: string, entry: ReceiverHistoryEntry, lifeContext?: string): PreparedPhraseDraft
    discard(id: string): boolean
    commit(id: string, entry: ReceiverHistoryEntry): { ok: boolean; item?: CommunicationSavedPhraseEntry; duplicate?: CommunicationSavedPhraseEntry; message?: string; cleanupPending?: boolean; conflict?: boolean }
  }
  export function createSavedPhrasePreparationService(options: { repository: CommunicationRepository; getScopeKey?: () => string; now?: () => number }): SavedPhrasePreparationService
}
declare module '@cboard-communication-core/repository' {
  import type { PreparedPhraseDraft } from '@cboard-communication-core/savedPhrasePreparation'
  export interface CommunicationRepository {
    savedPhraseCapacity: number
    loadSavedPhrasePreparation(): PreparedPhraseDraft | null
    writeSavedPhrasePreparation(draft: PreparedPhraseDraft | null): PreparedPhraseDraft | null
  }
}
