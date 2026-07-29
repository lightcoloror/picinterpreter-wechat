declare module '@cboard-communication-core/emergencyCommunication' {
  export interface EmergencyCommunicationPhrase {
    id: string
    label: string
    text: string
    tone: 'critical' | 'warning' | 'fear' | 'calm' | 'need'
  }

  export const EMERGENCY_COMMUNICATION_PHRASES: readonly EmergencyCommunicationPhrase[]
  export function getEmergencyCommunicationPhrase(
    id: string
  ): EmergencyCommunicationPhrase | null
  export function buildEmergencyCommunicationFallback(id: string): {
    text: string
    ariaLabel: string
    visibleDurationMs: number
  } | null
}
