import {
  createBoardDTO,
  getBoardDTOTilesInDisplayOrder,
  type BoardDTO,
  type TileDTO
} from '@cboard-communication-core/dto'

import generatedBoards from '../generated/cboardDefaultBoards.json'
import {
  CBOARD_CHINESE_SYNCHRONIZED_LABEL_KEYS,
  resolveCboardChineseBoardName,
  resolveCboardChineseTileLabel
} from './cboardChineseOverrides'
import { resolveCboardDefaultPictogramAttribution } from './cboardDefaultAttribution'

export const DEFAULT_ROOT_BOARD_ID = 'root'

const CALIBRATED_DEFAULT_LABEL_KEYS = [
  'symbol.peopleProfession.nurse',
  'symbol.peopleProfession.speechLanguageTherapist',
  'symbol.electricalPhone.iphone',
  'symbol.healthcareMedicalConditions.toVomit',
  'symbol.foodKitchenItems.fork',
  'symbol.foodKitchenItems.knife',
  'symbol.foodKitchenItems.spoon',
  'symbol.foodKitchenItems.bowl'
]

const sourceBoardDTOs: BoardDTO[] = generatedBoards.map(board => {
  const boardDTO = createBoardDTO({
    ...board,
    tiles: board.tiles.map(tile => ({
      ...tile,
      pictogramAttribution:
        resolveCboardDefaultPictogramAttribution(tile)
    }))
  }, {
    resolveName: resolveCboardChineseBoardName,
    resolveTileLabel: resolveCboardChineseTileLabel,
    conceptProfileLabelKeys: CALIBRATED_DEFAULT_LABEL_KEYS,
    synchronizeVocalizationLabelKeys:
      CBOARD_CHINESE_SYNCHRONIZED_LABEL_KEYS
  })
  return {
    ...boardDTO,
    tiles: boardDTO.tiles
  }
})

const defaultBoardNames = new Map(
  sourceBoardDTOs.map(board => [board.id, board.name])
)

export const DEFAULT_BOARD_FIXTURES: BoardDTO[] = sourceBoardDTOs.map(
  board => ({
    ...board,
    tiles: board.tiles.map(tile => {
      const targetBoardName = tile.loadBoardId
        ? defaultBoardNames.get(tile.loadBoardId)
        : ''

      return targetBoardName
        ? {
            ...tile,
            label: targetBoardName,
            vocalization: targetBoardName
          }
        : tile
    })
  })
)

const rootBoard =
  DEFAULT_BOARD_FIXTURES.find(board => board.id === DEFAULT_ROOT_BOARD_ID) ||
  DEFAULT_BOARD_FIXTURES[0]

if (!rootBoard) {
  throw new Error('The generated CBoard package does not contain a root board.')
}

export const DEFAULT_BOARD_FIXTURE: BoardDTO = rootBoard
export const DEFAULT_BOARD_TILES: TileDTO[] = DEFAULT_BOARD_FIXTURES.flatMap(
  board => getBoardDTOTilesInDisplayOrder(board)
)

export function getDefaultBoardById(boardId: string) {
  return DEFAULT_BOARD_FIXTURES.find(board => board.id === boardId) || null
}

export function getDefaultTileById(tileId: string, boardId = '') {
  const boards = boardId
    ? DEFAULT_BOARD_FIXTURES.filter(board => board.id === boardId)
    : DEFAULT_BOARD_FIXTURES

  for (const board of boards) {
    const tile = board.tiles.find(item => item.id === tileId)
    if (tile) {
      return tile
    }
  }

  return null
}
