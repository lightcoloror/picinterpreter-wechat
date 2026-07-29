import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { DEFAULT_BOARD_TILES } from './defaultBoard'
import { resolveCboardDefaultPictogramAttribution } from './cboardDefaultAttribution'

interface SourceTile {
  id: string
  labelKey?: string
  image?: string
}

interface SourceBoard {
  tiles?: SourceTile[]
}

function getExpectedProvider(image: string) {
  const match = image.match(/\/symbols\/([^/]+)\//)
  return match ? match[1] : 'unknown'
}

describe('CBoard default pictogram attribution', () => {
  const source = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), '../cboard/src/api/boards.json'),
      'utf8'
    )
  ) as { advanced: SourceBoard[] }
  const sourceTiles = source.advanced.flatMap(board => board.tiles || [])

  test('matches every upstream CBoard image provider', () => {
    sourceTiles.forEach(tile => {
      expect(
        resolveCboardDefaultPictogramAttribution(tile).provider
      ).toBe(getExpectedProvider(String(tile.image || '')))
    })
  })

  test('keeps provider-specific attribution on every packaged TileDTO', () => {
    const providerCounts = DEFAULT_BOARD_TILES.reduce<Record<string, number>>(
      (counts, tile) => {
        const provider = tile.pictogramAttribution?.provider || 'missing'
        counts[provider] = (counts[provider] || 0) + 1
        return counts
      },
      {}
    )

    expect(providerCounts).toEqual({
      arasaac: 62,
      cboard: 17,
      mulberry: 792
    })
    expect(
      DEFAULT_BOARD_TILES.find(
        tile => tile.pictogramAttribution?.provider === 'arasaac'
      )?.pictogramAttribution?.license
    ).toBe('CC BY-NC-SA 4.0')
    expect(
      DEFAULT_BOARD_TILES.find(
        tile => tile.pictogramAttribution?.provider === 'mulberry'
      )?.pictogramAttribution?.license
    ).toBe('CC BY-SA 4.0')
  })
})
