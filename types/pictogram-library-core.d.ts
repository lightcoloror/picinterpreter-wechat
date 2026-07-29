declare module '@cboard-communication-core/pictogramLibrary' {
  import type { BoardDTO } from '@cboard-communication-core/dto'

  export interface PictogramLibraryConceptDTO {
    id: string
    canonicalLabel: string
    canonicalLabelEn: string
    language: string
    keyPath: string
    semanticDomain: string
    category: string
    synonyms: string[]
    relatedTerms: string[]
    excludeTokens: string[]
    keywords: string[]
    tags: string[]
    reviewStatus: string
  }

  export interface PictogramLibrarySymbolAssetDTO {
    id: string
    image: string
    sourceProvider: string
    sourceAssetId: string
    sourceUrl: string
    license: string
    licenseUrl: string | null
    attributionText: string
    author: string | null
    authorUrl: string | null
    repoKey: string | null
    imageType: string
    scope: string
    reviewStatus: string
  }

  export interface PictogramLibraryDTO {
    dtoType: 'PictogramLibraryDTO'
    version: 1
    locale: string
    concepts: PictogramLibraryConceptDTO[]
    symbolAssets: PictogramLibrarySymbolAssetDTO[]
    conceptSymbolLinks: Array<{
      id: string
      conceptId: string
      symbolAssetId: string
      role: 'default' | 'alternate'
      rank: number
    }>
    boards: Array<{
      id: string
      name: string
      nameKey: string
      category: string
      layout: BoardDTO['layout']
    }>
    boardItems: Array<{
      id: string
      boardId: string
      tileId: string
      conceptId: string
      symbolAssetId: string
      positionIndex: number
      vocalization: string
      backgroundColor: string
      loadBoardId: string
    }>
  }

  export const PICTOGRAM_LIBRARY_DTO_TYPE: 'PictogramLibraryDTO'
  export const PICTOGRAM_LIBRARY_DTO_VERSION: 1
  export function createPictogramLibraryDTO(
    boards: unknown[],
    options?: {
      locale?: string
      resolveBoardName?: (board: unknown) => string
      resolveTileLabel?: (tile: unknown) => string
      resolveEnglishName?: (tile: BoardDTO['tiles'][number]) => string
      conceptProfileLabelKeys?: string[]
    }
  ): PictogramLibraryDTO
  export function isPictogramLibraryDTO(
    value: unknown
  ): value is PictogramLibraryDTO
  export function assertPictogramLibraryDTO(
    value: unknown
  ): PictogramLibraryDTO
  export function pictogramLibraryDTOToBoards(
    value: PictogramLibraryDTO
  ): BoardDTO[]
  export function getPictogramLibraryDTOStats(
    value: PictogramLibraryDTO
  ): {
    boardCount: number
    boardItemCount: number
    conceptCount: number
    symbolAssetCount: number
    attributedSymbolAssetCount: number
    unattributedSymbolAssetCount: number
    linkedConceptCount: number
  }
}
