import type { BoardDTO } from '@cboard-communication-core/dto'

export interface CareLocalMediaScope {
  accountId: string
  familyId: string
  profileId: string
}

function sameCareScope(left: CareLocalMediaScope, right: CareLocalMediaScope) {
  return left.accountId === right.accountId &&
    left.familyId === right.familyId &&
    left.profileId === right.profileId
}

/**
 * Preserve device-local tile media references when a cloud projection replaces
 * the Care library. Only cloud-present boards/tiles are eligible, so remote
 * deletions are never restored. The caller must pass the library from the
 * current Care-scoped store and its matching scope.
 */
export function preserveCareLocalTileMedia(
  cloudBoards: BoardDTO[],
  localBoards: BoardDTO[],
  localScope: CareLocalMediaScope,
  projectionScope: CareLocalMediaScope
) {
  if (!sameCareScope(localScope, projectionScope)) return cloudBoards

  const localByBoard = new Map(localBoards.map(board => [board.id, board]))
  return cloudBoards.map(board => {
    const localBoard = localByBoard.get(board.id)
    if (!localBoard) return board

    const localByTile = new Map(localBoard.tiles.map(tile => [tile.id, tile]))
    let changed = false
    const tiles = board.tiles.map(tile => {
      const localTile = localByTile.get(tile.id)
      if (!localTile) return tile

      const next = { ...tile }
      if (Object.prototype.hasOwnProperty.call(localTile, 'mediaType')) {
        next.mediaType = localTile.mediaType
      }
      if (Object.prototype.hasOwnProperty.call(localTile, 'video')) {
        next.video = localTile.video
      }
      if (Object.prototype.hasOwnProperty.call(localTile, 'sound')) {
        next.sound = localTile.sound
      }
      if (
        next.mediaType !== tile.mediaType ||
        next.video !== tile.video ||
        next.sound !== tile.sound
      ) {
        changed = true
        return next
      }
      return tile
    })
    return changed ? { ...board, tiles } : board
  })
}
