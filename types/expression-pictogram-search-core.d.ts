declare module '@cboard-communication-core/expressionPictogramSearch' {
  import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'

  export type ExpressionPictogramMatchType =
    | 'exact-label'
    | 'exact-synonym'
    | 'label-prefix'
    | 'synonym-prefix'
    | 'label-contains'
    | 'synonym-contains'

  export const EXPRESSION_PICTOGRAM_MATCH_TYPES: {
    readonly exactLabel: 'exact-label'
    readonly exactSynonym: 'exact-synonym'
    readonly labelPrefix: 'label-prefix'
    readonly synonymPrefix: 'synonym-prefix'
    readonly labelContains: 'label-contains'
    readonly synonymContains: 'synonym-contains'
  }

  export interface ExpressionPictogramSearchMatch {
    tile: TileDTO
    boardId: string
    boardName: string
    matchType: ExpressionPictogramMatchType
    matchedText: string
  }

  export interface ExpressionPictogramSearchResult {
    query: string
    matches: ExpressionPictogramSearchMatch[]
  }

  export function normalizeExpressionPictogramSearchQuery(
    value: unknown
  ): string

  export function searchExpressionPictograms(
    boards: BoardDTO[],
    query: unknown,
    options?: {
      limit?: number
      intl?: unknown
    }
  ): ExpressionPictogramSearchResult
}
