declare module '@cboard-communication-core/openBoardFormat' {
  import type { BoardDTO } from '@cboard-communication-core/dto'

  export interface OpenBoardDocumentEntry {
    path: string
    board: unknown
  }

  export interface OpenBoardImportDiagnostics {
    sourceBoardCount: number
    importedBoardCount: number
    importedTileCount: number
    conflictBoardCount: number
    skippedMalformedBoardCount: number
    skippedMalformedButtonCount: number
    unresolvedImageCount: number
    unresolvedSoundCount: number
  }

  export interface OpenBoardImageDescriptor {
    id?: string
    path?: string
    data?: string
    url?: string
    author?: string
    license?: string
  }

  export interface OpenBoardSoundDescriptor {
    id?: string
    path?: string
    data?: string
    url?: string
    content_type?: string
  }

  export const OPEN_BOARD_FORMAT_VERSION: 'open-board-0.1'
  export const OPEN_BOARD_IMPORT_BOARD_ID_PREFIX: string

  export function normalizeOpenBoardArchivePath(value: unknown): string
  export function isOpenBoardDocument(value: unknown): boolean
  export function importOpenBoardDocuments(options: {
    documents: OpenBoardDocumentEntry[]
    existingBoards?: BoardDTO[]
    conflictStrategy?: 'merge' | 'skip'
    resolveImage?: (
      image: OpenBoardImageDescriptor,
      context: {
        board: unknown
        boardId: string
        boardPath: string
        button: unknown
        tileId: string
      }
    ) => string | Promise<string>
    resolveSound?: (
      sound: OpenBoardSoundDescriptor,
      context: {
        board: unknown
        boardId: string
        boardPath: string
        button: unknown
        tileId: string
      }
    ) => string | Promise<string>
  }): Promise<{
    boards: BoardDTO[]
    diagnostics: OpenBoardImportDiagnostics
  }>
}
