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
import {
  normalizeExpressionDraftSnapshot,
  type ExpressionDraftSnapshot
} from '@cboard-communication-core/expressionDraft'

export const MAX_EXPRESSION_TILES = 12
// Match CBoard's bounded, memory-only output undo history.
export const MAX_EXPRESSION_UNDO = 20

interface ExpressionSessionSnapshot {
  selectedTiles: TileDTO[]
  pipeline: ExpressionPipelineState
  restored: boolean
}

export interface ExpressionSessionState extends ExpressionSessionSnapshot {
  undoHistory?: ExpressionSessionSnapshot[]
}

export type ExpressionSessionAction =
  | { type: 'add-tile'; tile: TileDTO }
  | { type: 'remove-last' }
  | { type: 'remove-tile'; index: number }
  | { type: 'move-tile'; index: number; offset: number }
  | { type: 'clear' }
  | { type: 'undo-delete' }
  | { type: 'reset' }
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

export function createExpressionSessionFromDraft(
  value: ExpressionDraftSnapshot
): ExpressionSessionState {
  const snapshot = normalizeExpressionDraftSnapshot(value)
  // A local reviewed snapshot owns both ordered identity and its sentence.
  // Never resolve its duplicate IDs through today's library or restore undo.
  return {
    selectedTiles: JSON.parse(JSON.stringify(snapshot.pipeline.outputSnapshot)),
    pipeline: snapshot.pipeline,
    restored: true
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
  _boardOrBoards: BoardDTO | BoardDTO[],
  entry: ExpressionSavedPhraseEntry
): ExpressionSessionState {
  // A reviewed favorite owns ordered snapshots, including same-ID people and
  // text-only entries. Re-resolving by library ID would silently change identity.
  const selectedTiles: TileDTO[] = JSON.parse(JSON.stringify(entry.output || []))

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

function snapshotSession(state: ExpressionSessionState): ExpressionSessionSnapshot {
  // TileDTOs and the pipeline are immutable. Keep media and candidate metadata;
  // undo must not re-match pictures, regenerate AI sentences or write history.
  return {
    selectedTiles: state.selectedTiles.slice(),
    pipeline: state.pipeline,
    restored: state.restored
  }
}

function rememberDeletion(
  state: ExpressionSessionState,
  selectedTiles: TileDTO[]
): ExpressionSessionState {
  return {
    ...rebuildSession(selectedTiles),
    undoHistory: [...(state.undoHistory || []), snapshotSession(state)]
      .slice(-MAX_EXPRESSION_UNDO)
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
          : rememberDeletion(state, selectedTiles)
      }
    case 'remove-tile': {
      const selectedTiles = removeExpressionOutputItem(
        state.selectedTiles,
        action.index
      )
      return selectedTiles === state.selectedTiles
        ? state
        : rememberDeletion(state, selectedTiles)
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
      return state.selectedTiles.length || state.pipeline.candidateSentences.length
        ? rememberDeletion(state, []) : state
    case 'undo-delete': {
      const history = state.undoHistory || []
      if (!history.length) return state
      return { ...history[history.length - 1], undoHistory: history.slice(0, -1) }
    }
    case 'reset':
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
      return snapshotSession(action.state)
    default:
      return state
  }
}
