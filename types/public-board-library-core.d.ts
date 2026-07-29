declare module '@cboard-communication-core/publicBoardLibrary' {
  import type { BoardDTO } from '@cboard-communication-core/dto'

  export const PUBLIC_BOARD_BUNDLE_FORMAT: 'cboard-public-board-bundle'
  export const PUBLIC_BOARD_BUNDLE_VERSION: 1
  export const PUBLIC_BOARD_IMPORT_PREFIX: 'cboard-public-'
  export const PUBLIC_BOARD_UNKNOWN_LICENSE: string
  export const PUBLIC_BOARD_SOURCE_URL: string

  export interface PublicBoardBundleDiagnostics {
    boardCount: number
    tileCount: number
    unavailableLinkedBoardCount: number
  }

  export interface PublicBoardBundle {
    format: 'cboard-public-board-bundle'
    contractVersion: 1
    rootBoardId: string
    source: 'cboard-public'
    sourceUrl: string
    licenseStatus: 'unknown'
    warnings: string[]
    data: unknown[]
    diagnostics: PublicBoardBundleDiagnostics
  }

  export interface ImportedPublicBoardBundle {
    rootBoardId: string
    boards: BoardDTO[]
    warnings: string[]
    diagnostics: PublicBoardBundleDiagnostics
  }

  export function isPublicBoardBundle(
    value: unknown
  ): value is PublicBoardBundle

  export function importPublicBoardBundle(
    value: unknown
  ): ImportedPublicBoardBundle
}
