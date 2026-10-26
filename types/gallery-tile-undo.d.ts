declare module '@cboard-communication-core/galleryTileUndo' {
  import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
  export interface GalleryTileUndoState { count: number; operationId: string | null; label: string }
  export interface GalleryTileUndoResult extends GalleryTileUndoState { changed: boolean; board?: BoardDTO; tile?: TileDTO }
  export interface GalleryTileUndoOptions { guard?: () => boolean; expectedBoard?: BoardDTO }
  export interface GalleryTileUndoService {
    state(): GalleryTileUndoState
    subscribe(listener: (state: GalleryTileUndoState) => void): () => void
    clear(): void
    delete(boardId: string, tileId: string, options?: GalleryTileUndoOptions): Promise<GalleryTileUndoResult>
    undo(operationId: string, options?: GalleryTileUndoOptions): Promise<GalleryTileUndoResult>
  }
  export function createGalleryTileUndoService(options: {
    getScopeKey: () => string
    loadBoards: () => BoardDTO[]
    saveBoard: (board: BoardDTO, options: { expectedBoard: BoardDTO; guard: () => boolean }) => boolean | Promise<boolean>
    canManage: (board: BoardDTO) => boolean
    now?: () => number
  }): GalleryTileUndoService
  export function clearGalleryTileUndoSessions(): void
}
