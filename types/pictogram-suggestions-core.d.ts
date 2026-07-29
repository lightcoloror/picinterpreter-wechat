declare module '@cboard-communication-core/pictogramSuggestions' {
  import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
  import type {
    PictogramOrderingState
  } from '@cboard-communication-core/pictogramOrdering'

  export const PICTOGRAM_SUGGESTION_MODES: {
    readonly recent: 'recent'
    readonly next: 'next'
  }

  export interface PictogramSuggestionResult {
    mode: 'recent' | 'next'
    category: string
    tiles: TileDTO[]
  }

  export function buildExpressionPictogramSuggestions(
    boards: BoardDTO[],
    selectedTiles: TileDTO[],
    orderingState: PictogramOrderingState | null | undefined,
    options?: {
      limit?: number
      activeBoardId?: string
    }
  ): PictogramSuggestionResult
}
