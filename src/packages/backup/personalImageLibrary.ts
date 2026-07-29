import type { BoardDTO } from '@cboard-communication-core/dto'

const SHARED_ASSET_PREFIX = '/assets/cboard-default/'
const LEGACY_ASSET_PREFIXES = [
  '/packages/caregiver/assets/cboard-default/',
  '/packages/backup/assets/cboard-default/'
]

function rebasePackagedImage(image: string) {
  const legacyPrefix = LEGACY_ASSET_PREFIXES.find(prefix =>
    image.startsWith(prefix)
  )
  return legacyPrefix
    ? SHARED_ASSET_PREFIX + image.slice(legacyPrefix.length)
    : image
}

export function rebasePersonalImageLibraryBoards(
  boards: BoardDTO[]
) {
  return boards.map(board => {
    let changed = false
    const tiles = board.tiles.map(tile => {
      const image = rebasePackagedImage(tile.image)
      if (image === tile.image) return tile

      changed = true
      return { ...tile, image }
    })

    return changed ? { ...board, tiles } : board
  })
}
