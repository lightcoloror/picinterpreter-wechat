import type { BoardDTO } from '@cboard-communication-core/dto'
import { createGalleryTileUndoService } from '@cboard-communication-core/galleryTileUndo'

interface GalleryStore {
  load(): BoardDTO[]
  save(boards: BoardDTO[]): BoardDTO[]
}

export function createGalleryTileUndoAdapter({
  store, getScopeKey, canManage
}: {
  store: GalleryStore
  getScopeKey: () => string
  canManage: (board: BoardDTO) => boolean
}) {
  return createGalleryTileUndoService({
    getScopeKey,
    loadBoards: () => store.load(),
    canManage,
    saveBoard(board, { expectedBoard, guard }) {
      const scope = getScopeKey()
      if (!guard() || !canManage(board)) return false
      const current = store.load()
      const index = current.findIndex(item => item.id === board.id)
      if (index < 0 || JSON.stringify(current[index]) !== JSON.stringify(expectedBoard)) return false
      if (!guard() || scope !== getScopeKey() || !canManage(current[index])) return false
      // Preserve every other board from this latest read. The shared service
      // verifies the persisted target board again before confirming the action.
      store.save(current.map((item, i) => i === index ? board : item))
      return guard() && scope === getScopeKey() && canManage(board)
    }
  })
}
