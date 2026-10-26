declare module '@cboard-communication-core/savedPhraseManagement' {
  import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'

  export const DEFAULT_LIFE_CONTEXTS: readonly string[]
  export function normalizeLifeContext(value: unknown): string
  export function getSavedPhraseLifeContexts(entries: CommunicationSavedPhraseEntry[]): string[]
  export function filterSavedPhrasesByLifeContext(entries: CommunicationSavedPhraseEntry[], context?: string | null): CommunicationSavedPhraseEntry[]
  export function assignSavedPhraseLifeContext(entries: CommunicationSavedPhraseEntry[], id: string, context: string): {changed: boolean; items: CommunicationSavedPhraseEntry[]}
}
