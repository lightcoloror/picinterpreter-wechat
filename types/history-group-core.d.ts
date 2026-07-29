declare module '@cboard-communication-core/historyManagement' {
  import type {
    CommunicationHistoryEntry
  } from '@cboard-communication-core/repository'

  export function groupCommunicationHistoryBySession(
    entries: CommunicationHistoryEntry[],
    options?: { limit?: number }
  ): Array<{
    sessionId: string
    items: CommunicationHistoryEntry[]
  }>
}
