declare module '@cboard-communication-core/communicationPreferences' {
  export type CommunicationFontSize = 'normal' | 'large' | 'extra-large'
  export type CommunicationCandidateAutoplayDelay = 0 | 5 | 10 | 15 | 30
  export type CommunicationPictogramSortMode = 'manual' | 'popularity'
  export interface CommunicationPreferences {
    highContrast: boolean
    fontSize: CommunicationFontSize
    gridColumns: 2 | 3 | 4
    speechRate: number
    speechVoice: string
    candidateAutoplayDelaySeconds: CommunicationCandidateAutoplayDelay
    onlinePictogramSearchEnabled: boolean
    pictogramSortMode: CommunicationPictogramSortMode
    hiddenBoardIds: string[]
    onboardingComplete: boolean
  }

  export const DEFAULT_COMMUNICATION_PREFERENCES: CommunicationPreferences
  export const COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS:
    readonly CommunicationCandidateAutoplayDelay[]
  export const COMMUNICATION_PICTOGRAM_SORT_MODES:
    readonly CommunicationPictogramSortMode[]
  export function normalizeCommunicationPreferences(
    value: unknown
  ): CommunicationPreferences
  export function updateCommunicationPreferences(
    current: CommunicationPreferences,
    changes: Partial<CommunicationPreferences>
  ): CommunicationPreferences
  export function toggleCommunicationBoardVisibility(
    current: CommunicationPreferences,
    boardId: string
  ): CommunicationPreferences
  export function projectVisibleCommunicationBoards<
    TBoard extends {
      id?: string
      layout?: {
        tileIds: string[]
      }
      tiles?: Array<{
        id?: string
        loadBoardId?: string
        loadBoard?: string | { id?: string }
      }>
    }
  >(
    boards: TBoard[],
    hiddenBoardIds: string[]
  ): TBoard[]
}
