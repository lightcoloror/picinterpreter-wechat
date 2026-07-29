import type {
  BoardDTO,
  TileDTO
} from '@cboard-communication-core/dto'
import { getBoardDTOTilesInDisplayOrder } from '@cboard-communication-core/dto'
import {
  appendPersonalPictogramToBoard,
  buildPersonalPictogramTileDTO,
  copyPersonalPictogramToBoard,
  movePersonalPictogramInBoard,
  removePersonalPictogramFromBoard,
  updatePersonalPictogramInBoards
} from '@cboard-communication-core/pictogramMetadataSuggestion'

export const CUSTOM_PERSONAL_PICTOGRAM_ID_PREFIX =
  'device_private_custom_'

export interface CustomPersonalPictogramEntry {
  boardId: string
  boardName: string
  tile: TileDTO
}

export interface CustomPersonalPictogramInput {
  id: string
  boardId: string
  image: string
  mediaType?: 'image' | 'gif' | 'video'
  video?: string
  label: string
  vocalization?: string
  sound?: string
  synonyms?: string
  category?: string
  author?: string
  license?: string
}

export interface CopyCustomPersonalPictogramInput {
  id: string
  targetBoardId: string
}

export type CustomPersonalPictogramMoveDirection =
  | 'earlier'
  | 'later'

export function listCustomPersonalPictograms(
  boards: BoardDTO[]
): CustomPersonalPictogramEntry[] {
  return boards.flatMap(board =>
    getBoardDTOTilesInDisplayOrder(board)
      .filter(
        tile =>
          tile.id.startsWith(CUSTOM_PERSONAL_PICTOGRAM_ID_PREFIX) &&
          Boolean(
            tile.pictogramAttribution &&
              tile.pictogramAttribution.provider === 'device-private'
          )
      )
      .map(tile => ({
        boardId: board.id,
        boardName: board.name,
        tile
      }))
  )
}

export function moveCustomPersonalPictogram(
  boards: BoardDTO[],
  boardId: string,
  tileId: string,
  direction: CustomPersonalPictogramMoveDirection
) {
  const existing = listCustomPersonalPictograms(boards).find(
    entry => entry.boardId === boardId && entry.tile.id === tileId
  )
  if (!existing) return null

  const nextBoards = movePersonalPictogramInBoard(
    boards,
    boardId,
    tileId,
    direction
  )
  return {
    moved: existing,
    boards: nextBoards,
    changed: nextBoards !== boards
  }
}

export function createCustomPersonalPictogram(
  boards: BoardDTO[],
  value: CustomPersonalPictogramInput
) {
  const tile = buildPersonalPictogramTileDTO(value)
  return {
    tile,
    boards: appendPersonalPictogramToBoard(
      boards,
      value.boardId,
      tile
    )
  }
}

export function updateCustomPersonalPictogram(
  boards: BoardDTO[],
  sourceBoardId: string,
  value: CustomPersonalPictogramInput
) {
  const existing = listCustomPersonalPictograms(boards).find(
    entry =>
      entry.boardId === sourceBoardId &&
      entry.tile.id === value.id
  )
  if (!existing) return null

  const tile = buildPersonalPictogramTileDTO(value)
  return {
    previous: existing,
    tile,
    boards: updatePersonalPictogramInBoards(
      boards,
      sourceBoardId,
      value.boardId,
      tile
    )
  }
}

export function copyCustomPersonalPictogram(
  boards: BoardDTO[],
  sourceBoardId: string,
  tileId: string,
  value: CopyCustomPersonalPictogramInput
) {
  const existing = listCustomPersonalPictograms(boards).find(
    entry =>
      entry.boardId === sourceBoardId &&
      entry.tile.id === tileId
  )
  if (!existing) return null

  return copyPersonalPictogramToBoard(
    boards,
    sourceBoardId,
    tileId,
    value.targetBoardId,
    value.id
  )
}

export function isCustomPictogramMediaReferencedElsewhere(
  boards: BoardDTO[],
  boardId: string,
  tileId: string,
  field: 'image' | 'sound' | 'video',
  path: string
) {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return false

  return boards.some(board =>
    board.tiles.some(tile =>
      (board.id !== boardId || tile.id !== tileId) &&
      String(tile[field] || '').trim() === normalizedPath
    )
  )
}

export function removeCustomPersonalPictogram(
  boards: BoardDTO[],
  boardId: string,
  tileId: string
) {
  const existing = listCustomPersonalPictograms(boards).find(
    entry => entry.boardId === boardId && entry.tile.id === tileId
  )
  if (!existing) return null

  return {
    removed: existing,
    boards: removePersonalPictogramFromBoard(
      boards,
      boardId,
      tileId
    )
  }
}
