import {
  applyCommunicationAiSentenceResponse,
  type CommunicationAiSentenceResponse
} from '@cboard-communication-core/communicationAi'

import {
  buildExpressionLoopState,
  buildExpressionLoopStateFromSavedPhrase,
  moveExpressionOutputItem,
  removeExpressionOutputItem,
  selectExpressionCandidate,
  type ExpressionPipelineState,
  type ExpressionSavedPhraseEntry
} from '@cboard-communication-core/expressionPipeline'
import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
import type { CommunicationHistoryEntry } from '@cboard-communication-core/repository'

export const MAX_EXPRESSION_TILES = 12

export interface ExpressionSessionState {
  selectedTiles: TileDTO[]
  pipeline: ExpressionPipelineState
  restored: boolean
}

export type ExpressionSessionAction =
  | { type: 'add-tile'; tile: TileDTO }
  | { type: 'remove-last' }
  | { type: 'remove-tile'; index: number }
  | { type: 'move-tile'; index: number; offset: number }
  | { type: 'clear' }
  | { type: 'select-candidate'; index: number }
  | {
      type: 'apply-ai-candidates'
      response: CommunicationAiSentenceResponse
    }
  | { type: 'replace-session'; state: ExpressionSessionState }

export function createExpressionSession(
  selectedTiles: TileDTO[] = [],
  restored = false
): ExpressionSessionState {
  const output = selectedTiles.slice(0, MAX_EXPRESSION_TILES)

  return {
    selectedTiles: output,
    pipeline: buildExpressionLoopState(output),
    restored
  }
}

function resolveCurrentExpressionTiles(
  boardOrBoards: BoardDTO | BoardDTO[],
  output: Array<{ id: string; boardId?: string }>
): TileDTO[] {
  const boards = Array.isArray(boardOrBoards) ? boardOrBoards : [boardOrBoards]
  const tiles = boards.flatMap(board => board.tiles)
  const currentTilesByKey = new Map(
    tiles.map(tile => [`${tile.boardId}:${tile.id}`, tile])
  )
  const currentTilesById = new Map(tiles.map(tile => [tile.id, tile]))

  return (output || [])
    .map(tile => {
      const exactTile = tile.boardId
        ? currentTilesByKey.get(`${tile.boardId}:${tile.id}`)
        : undefined

      return exactTile || currentTilesById.get(tile.id)
    })
    .filter((tile): tile is TileDTO => Boolean(tile))
    .slice(0, MAX_EXPRESSION_TILES)
}

export function restoreExpressionSession(
  boardOrBoards: BoardDTO | BoardDTO[],
  history: CommunicationHistoryEntry[],
  sessionId?: string
): ExpressionSessionState {
  const normalizedSessionId = String(sessionId || '').trim()
  const latestExpression = (history || []).find(
    entry =>
      entry.direction === 'express' &&
      (!normalizedSessionId || entry.sessionId === normalizedSessionId) &&
      Array.isArray(entry.output) &&
      entry.output.length > 0
  )

  if (!latestExpression || !latestExpression.output) {
    return createExpressionSession()
  }

  const restoredTiles = resolveCurrentExpressionTiles(
    boardOrBoards,
    latestExpression.output
  )

  if (!restoredTiles.length) {
    return createExpressionSession()
  }

  return {
    selectedTiles: restoredTiles,
    pipeline: buildExpressionLoopStateFromSavedPhrase({
      contractVersion: latestExpression.contractVersion,
      sentence: latestExpression.sentence,
      output: restoredTiles
    }),
    restored: true
  }
}

export function createExpressionSessionFromSavedPhrase(
  boardOrBoards: BoardDTO | BoardDTO[],
  entry: ExpressionSavedPhraseEntry
): ExpressionSessionState {
  const selectedTiles = resolveCurrentExpressionTiles(
    boardOrBoards,
    entry.output
  )

  if (!selectedTiles.length) {
    return createExpressionSession()
  }

  return {
    selectedTiles,
    pipeline: buildExpressionLoopStateFromSavedPhrase({
      ...entry,
      output: selectedTiles
    }),
    restored: false
  }
}

export function createExpressionSessionFromTileReferences(
  boardOrBoards: BoardDTO | BoardDTO[],
  output: Array<{ id: string; boardId?: string }>
): ExpressionSessionState {
  const selectedTiles = resolveCurrentExpressionTiles(boardOrBoards, output)
  return selectedTiles.length
    ? createExpressionSession(selectedTiles, true)
    : createExpressionSession()
}

function rebuildSession(selectedTiles: TileDTO[]): ExpressionSessionState {
  return {
    selectedTiles,
    pipeline: buildExpressionLoopState(selectedTiles),
    restored: false
  }
}

export function expressionSessionReducer(
  state: ExpressionSessionState,
  action: ExpressionSessionAction
): ExpressionSessionState {
  switch (action.type) {
    case 'add-tile':
      if (state.selectedTiles.length >= MAX_EXPRESSION_TILES) {
        return state
      }
      return rebuildSession([...state.selectedTiles, action.tile])
    case 'remove-last':
      {
        const selectedTiles = removeExpressionOutputItem(
          state.selectedTiles,
          state.selectedTiles.length - 1
        )
        return selectedTiles === state.selectedTiles
          ? state
          : rebuildSession(selectedTiles)
      }
    case 'remove-tile': {
      const selectedTiles = removeExpressionOutputItem(
        state.selectedTiles,
        action.index
      )
      return selectedTiles === state.selectedTiles
        ? state
        : rebuildSession(selectedTiles)
    }
    case 'move-tile': {
      const selectedTiles = moveExpressionOutputItem(
        state.selectedTiles,
        action.index,
        action.offset
      )
      return selectedTiles === state.selectedTiles
        ? state
        : rebuildSession(selectedTiles)
    }
    case 'clear':
      return rebuildSession([])
    case 'select-candidate':
      return {
        ...state,
        pipeline: selectExpressionCandidate(state.pipeline, action.index)
      }
    case 'apply-ai-candidates': {
      const pipeline = applyCommunicationAiSentenceResponse(
        state.pipeline,
        action.response
      )

      return pipeline === state.pipeline ? state : { ...state, pipeline, restored: false }
    }
    case 'replace-session':
      return action.state
    default:
      return state
  }
}
