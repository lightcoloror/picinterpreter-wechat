declare module '@cboard-communication-core/savedPhraseSync' {
  import type {
    CommunicationSavedPhraseEntry,
    CommunicationSavedPhraseTombstone
  } from '@cboard-communication-core/repository'

  export function buildCommunicationSavedPhraseSyncPayload(
    entries: CommunicationSavedPhraseEntry[]
  ): Array<Record<string, unknown>>
  export function normalizeSavedPhraseTombstones(
    entries: unknown
  ): CommunicationSavedPhraseTombstone[]
  export function mergeVersionedCommunicationSavedPhrases(
    localEntries: CommunicationSavedPhraseEntry[],
    remoteEntries: CommunicationSavedPhraseEntry[],
    deletedPhrases?: CommunicationSavedPhraseTombstone[]
  ): {
    items: CommunicationSavedPhraseEntry[]
    tombstones: CommunicationSavedPhraseTombstone[]
    conflictCount: number
  }
}
