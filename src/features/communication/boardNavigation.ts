import {
  getBoardDTOTilesInDisplayOrder,
  type BoardDTO,
  type TileDTO
} from '@cboard-communication-core/dto'

export const ALL_BOARD_CATEGORY_ID = 'all'
export const DEFAULT_NAVIGATION_ROOT_ID = 'root'

const CATEGORY_LABELS: Record<string, string> = {
  core: '常用',
  actions: '动作',
  food: '饮食',
  emotions: '情绪',
  medical: '医疗',
  people: '人物',
  places: '地点',
  objects: '物品'
}

const CATEGORY_ORDER = [
  'core',
  'actions',
  'food',
  'emotions',
  'medical',
  'people',
  'places',
  'objects'
]

export interface BoardNavigationState {
  activeBoardId: string
  activeCategoryId: string
  trail: string[]
}

export interface BoardNavigationOption {
  id: string
  label: string
  count: number
}

function getTileCategory(tile: TileDTO) {
  return tile.communication.category.trim() || 'core'
}

function getRootBoard(boards: BoardDTO[]) {
  return boards.find(board => board.id === DEFAULT_NAVIGATION_ROOT_ID) || boards[0] || null
}

export function createBoardNavigationState(
  boards: BoardDTO[],
  initialBoardId = ''
): BoardNavigationState {
  const rootBoard = getRootBoard(boards)
  const activeBoard =
    boards.find(board => board.id === initialBoardId) || rootBoard

  return {
    activeBoardId: activeBoard ? activeBoard.id : '',
    activeCategoryId: ALL_BOARD_CATEGORY_ID,
    trail: []
  }
}

export function getActiveNavigationBoard(
  boards: BoardDTO[],
  state: BoardNavigationState
): BoardDTO | null {
  return (
    boards.find(board => board.id === state.activeBoardId) ||
    getRootBoard(boards)
  )
}

export function getBoardNavigationOptions(
  boards: BoardDTO[]
): BoardNavigationOption[] {
  return boards.map(board => ({
    id: board.id,
    label: board.name,
    count: board.tiles.length
  }))
}

export function getBoardCategoryOptions(
  board: BoardDTO | null
): BoardNavigationOption[] {
  if (!board) {
    return []
  }

  const tiles = getBoardDTOTilesInDisplayOrder(board)
  const counts = new Map<string, number>()
  const encounteredOrder: string[] = []

  tiles.forEach(tile => {
    const category = getTileCategory(tile)
    if (!counts.has(category)) {
      encounteredOrder.push(category)
    }
    counts.set(category, (counts.get(category) || 0) + 1)
  })

  const categories = [
    ...CATEGORY_ORDER.filter(category => counts.has(category)),
    ...encounteredOrder.filter(category => !CATEGORY_ORDER.includes(category))
  ]

  return [
    { id: ALL_BOARD_CATEGORY_ID, label: '全部', count: tiles.length },
    ...categories.map(category => ({
      id: category,
      label: CATEGORY_LABELS[category] || category,
      count: counts.get(category) || 0
    }))
  ]
}

export function selectNavigationBoard(
  boards: BoardDTO[],
  state: BoardNavigationState,
  boardId: string
): BoardNavigationState {
  if (!boards.some(board => board.id === boardId)) {
    return state
  }

  return {
    activeBoardId: boardId,
    activeCategoryId: ALL_BOARD_CATEGORY_ID,
    trail: []
  }
}

export function openNavigationTile(
  boards: BoardDTO[],
  state: BoardNavigationState,
  tile: TileDTO
): BoardNavigationState {
  const targetBoardId = tile.loadBoardId.trim()
  if (!targetBoardId || !boards.some(board => board.id === targetBoardId)) {
    return state
  }

  return {
    activeBoardId: targetBoardId,
    activeCategoryId: ALL_BOARD_CATEGORY_ID,
    trail: [...state.trail, state.activeBoardId].filter(Boolean)
  }
}

export function navigateToPreviousBoard(
  boards: BoardDTO[],
  state: BoardNavigationState
): BoardNavigationState {
  const previousBoardId = state.trail[state.trail.length - 1]
  if (!previousBoardId || !boards.some(board => board.id === previousBoardId)) {
    return state
  }

  return {
    activeBoardId: previousBoardId,
    activeCategoryId: ALL_BOARD_CATEGORY_ID,
    trail: state.trail.slice(0, -1)
  }
}

export function navigateToRootBoard(
  boards: BoardDTO[],
  state: BoardNavigationState
): BoardNavigationState {
  const rootBoard = getRootBoard(boards)
  if (!rootBoard || (state.activeBoardId === rootBoard.id && !state.trail.length)) {
    return state
  }

  return {
    activeBoardId: rootBoard.id,
    activeCategoryId: ALL_BOARD_CATEGORY_ID,
    trail: []
  }
}

export function selectNavigationCategory(
  boards: BoardDTO[],
  state: BoardNavigationState,
  categoryId: string
): BoardNavigationState {
  const board = getActiveNavigationBoard(boards, state)
  const categoryExists = getBoardCategoryOptions(board).some(
    category => category.id === categoryId
  )

  return categoryExists ? { ...state, activeCategoryId: categoryId } : state
}

export function getVisibleBoardTiles(
  boards: BoardDTO[],
  state: BoardNavigationState
): TileDTO[] {
  const board = getActiveNavigationBoard(boards, state)
  if (!board) {
    return []
  }

  const tiles = getBoardDTOTilesInDisplayOrder(board)
  if (state.activeCategoryId === ALL_BOARD_CATEGORY_ID) {
    return tiles
  }

  return tiles.filter(tile => getTileCategory(tile) === state.activeCategoryId)
}

export function getSelectableBoardTiles(
  boards: BoardDTO[],
  state: BoardNavigationState
) {
  return getVisibleBoardTiles(boards, state).filter(
    tile => !isNavigationTile(tile)
  )
}

export function isNavigationTile(tile: Pick<TileDTO, 'loadBoardId'>) {
  return Boolean(tile.loadBoardId.trim())
}

export function getBoardTileKey(tile: Pick<TileDTO, 'boardId' | 'id'>) {
  return tile.boardId + ':' + tile.id
}
