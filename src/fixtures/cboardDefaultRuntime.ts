interface CboardDefaultTileSource {
  id: string
  label: string
  labelKey: string
  vocalization: string
  image: string
  backgroundColor: string
  loadBoard: string
  communicationCategory?: string
  communicationSynonyms?: string
  communicationExcludeTokens?: string
  pictogramProvider?: string
  pictogramOriginalId?: string
}

export interface CboardDefaultBoardSource {
  id: string
  name: string
  nameKey: string
  tiles: CboardDefaultTileSource[]
}

interface CboardDefaultRuntimePayload {
  version: number
  boardFields: string[]
  tileFields: string[]
  boards: unknown[][]
}

const FORMAT_VERSION = 1
const REQUIRED_BOARD_FIELDS = ['id', 'name', 'nameKey', 'tiles']
const REQUIRED_TILE_FIELDS = [
  'id',
  'label',
  'labelKey',
  'vocalization',
  'image',
  'backgroundColor',
  'loadBoard'
]

function assertFieldContract(
  fields: string[],
  requiredFields: string[],
  scope: string
) {
  if (
    new Set(fields).size !== fields.length ||
    requiredFields.some(field => !fields.includes(field))
  ) {
    throw new Error(`Invalid CBoard default ${scope} field contract.`)
  }
}

function decodeRecord(fields: string[], row: unknown[]) {
  if (!Array.isArray(row) || row.length > fields.length) {
    throw new Error('Invalid CBoard default runtime row.')
  }

  return Object.fromEntries(
    row
      .map((value, index) => [fields[index], value])
      .filter(([field, value]) => field && value !== null)
  )
}

export function decodeCboardDefaultRuntimePayload(
  payload: CboardDefaultRuntimePayload
): CboardDefaultBoardSource[] {
  if (payload.version !== FORMAT_VERSION || !Array.isArray(payload.boards)) {
    throw new Error('Unsupported CBoard default runtime format.')
  }

  assertFieldContract(payload.boardFields, REQUIRED_BOARD_FIELDS, 'board')
  assertFieldContract(payload.tileFields, REQUIRED_TILE_FIELDS, 'tile')

  return payload.boards.map(boardRow => {
    const board = decodeRecord(payload.boardFields, boardRow)
    const tileRows = board.tiles

    if (!Array.isArray(tileRows)) {
      throw new Error('Invalid CBoard default runtime board tiles.')
    }

    return {
      ...board,
      tiles: tileRows.map(tileRow =>
        decodeRecord(payload.tileFields, tileRow as unknown[])
      )
    } as unknown as CboardDefaultBoardSource
  })
}
