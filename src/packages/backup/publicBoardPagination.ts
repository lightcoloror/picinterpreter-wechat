import type {
  PublicBoardSearchResult,
  PublicBoardSummary
} from '../../platform/publicBoardLibraryPort'

export const PUBLIC_BOARD_SEARCH_PAGE_SIZE = 20

export function mergePublicBoardSearchPage(
  current: PublicBoardSummary[],
  result: PublicBoardSearchResult,
  append: boolean
) {
  if (!append) return result.boards.slice()

  const merged = new Map(current.map(board => [board.id, board]))
  result.boards.forEach(board => merged.set(board.id, board))
  return Array.from(merged.values())
}

export function hasMorePublicBoards(
  loadedCount: number,
  total: number
) {
  return Math.max(0, loadedCount) < Math.max(0, total)
}
