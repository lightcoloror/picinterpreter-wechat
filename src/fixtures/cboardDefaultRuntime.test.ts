import { describe, expect, test } from 'vitest'

import generatedBoards from '../generated/cboardDefaultBoards.json'
import compactBoards from '../generated/cboardDefaultBoards.runtime.json'
import { decodeCboardDefaultRuntimePayload } from './cboardDefaultRuntime'

const BOARD_FIELDS = ['id', 'name', 'nameKey', 'tiles']
const TILE_FIELDS = [
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

function projectRecord(
  value: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter(field => Object.prototype.hasOwnProperty.call(value, field))
      .map(field => [field, value[field]])
  )
}

describe('CBoard compact default runtime data', () => {
  test('decodes to the exact runtime projection of the auditable source', () => {
    const expected = generatedBoards.map(board => ({
      ...projectRecord(board, BOARD_FIELDS),
      tiles: board.tiles.map(tile => projectRecord(tile, TILE_FIELDS))
    }))

    expect(decodeCboardDefaultRuntimePayload(compactBoards)).toEqual(expected)
  })

  test('rejects unsupported format versions', () => {
    expect(() =>
      decodeCboardDefaultRuntimePayload({
        ...compactBoards,
        version: 2
      })
    ).toThrow('Unsupported CBoard default runtime format.')
  })
})
