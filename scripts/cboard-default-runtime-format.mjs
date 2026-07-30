import assert from 'node:assert/strict'

export const CBOARD_DEFAULT_RUNTIME_FORMAT_VERSION = 1

const SOURCE_BOARD_FIELDS = [
  'author',
  'caption',
  'description',
  'email',
  'hidden',
  'id',
  'isPublic',
  'name',
  'nameKey',
  'tiles'
]

const SOURCE_TILE_FIELDS = [
  'backgroundColor',
  'communicationCategory',
  'communicationExcludeTokens',
  'communicationSynonyms',
  'id',
  'image',
  'label',
  'labelKey',
  'loadBoard',
  'pictogramOriginalId',
  'pictogramProvider',
  'vocalization'
]

export const RUNTIME_BOARD_FIELDS = ['id', 'name', 'nameKey', 'tiles']

export const RUNTIME_TILE_FIELDS = [
  'id',
  'label',
  'labelKey',
  'vocalization',
  'image',
  'backgroundColor',
  'loadBoard',
  'communicationCategory',
  'communicationSynonyms',
  'pictogramProvider',
  'pictogramOriginalId',
  'communicationExcludeTokens'
]

function assertKnownKeys(value, knownFields, path) {
  const unknownFields = Object.keys(value).filter(
    field => !knownFields.includes(field)
  )

  if (unknownFields.length) {
    throw new Error(
      path + ' contains unsupported fields: ' + unknownFields.join(', ')
    )
  }
}

function projectRecord(value, fields) {
  return Object.fromEntries(
    fields
      .filter(field => Object.prototype.hasOwnProperty.call(value, field))
      .map(field => [field, value[field]])
  )
}

function encodeRecord(value, fields) {
  const row = fields.map(field =>
    Object.prototype.hasOwnProperty.call(value, field) ? value[field] : null
  )

  while (row.length && row[row.length - 1] === null) {
    row.pop()
  }

  return row
}

function decodeRecord(row, fields) {
  return Object.fromEntries(
    row
      .map((value, index) => [fields[index], value])
      .filter(([field, value]) => field && value !== null)
  )
}

export function projectCboardDefaultRuntimeBoards(boards) {
  return boards.map((board, boardIndex) => {
    assertKnownKeys(board, SOURCE_BOARD_FIELDS, `boards[${boardIndex}]`)

    const projectedBoard = projectRecord(board, RUNTIME_BOARD_FIELDS)
    projectedBoard.tiles = (board.tiles || []).map((tile, tileIndex) => {
      assertKnownKeys(
        tile,
        SOURCE_TILE_FIELDS,
        `boards[${boardIndex}].tiles[${tileIndex}]`
      )
      return projectRecord(tile, RUNTIME_TILE_FIELDS)
    })
    return projectedBoard
  })
}

export function encodeCboardDefaultRuntimeBoards(boards) {
  const projectedBoards = projectCboardDefaultRuntimeBoards(boards)

  return {
    version: CBOARD_DEFAULT_RUNTIME_FORMAT_VERSION,
    boardFields: RUNTIME_BOARD_FIELDS,
    tileFields: RUNTIME_TILE_FIELDS,
    boards: projectedBoards.map(board =>
      encodeRecord(
        {
          ...board,
          tiles: board.tiles.map(tile =>
            encodeRecord(tile, RUNTIME_TILE_FIELDS)
          )
        },
        RUNTIME_BOARD_FIELDS
      )
    )
  }
}

export function decodeCboardDefaultRuntimeBoards(payload) {
  assert.equal(
    payload.version,
    CBOARD_DEFAULT_RUNTIME_FORMAT_VERSION,
    'Unsupported CBoard default runtime format'
  )
  assert.deepEqual(payload.boardFields, RUNTIME_BOARD_FIELDS)
  assert.deepEqual(payload.tileFields, RUNTIME_TILE_FIELDS)

  return payload.boards.map(boardRow => {
    const board = decodeRecord(boardRow, payload.boardFields)
    board.tiles = (board.tiles || []).map(tileRow =>
      decodeRecord(tileRow, payload.tileFields)
    )
    return board
  })
}
