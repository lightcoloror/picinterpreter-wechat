import {
  getPictogramAttribution,
  type PictogramAttribution
} from '@cboard-communication-core/pictogramAttribution'

interface CboardDefaultTileSource {
  id: string
  labelKey?: string
  image?: string
  pictogramProvider?: string
  pictogramOriginalId?: string
}

const ARASAAC_LABEL_KEYS = new Set([
  'cboard.symbol.and',
  'cboard.symbol.areYou',
  'cboard.symbol.characters',
  'cboard.symbol.countries',
  'cboard.symbol.goodbye',
  'cboard.symbol.iAm',
  'cboard.symbol.iHave',
  'cboard.symbol.iHavePainIn',
  'cboard.symbol.iLove',
  'cboard.symbol.iSaw',
  'cboard.symbol.itIs',
  'cboard.symbol.letsGoBy',
  'cboard.symbol.my',
  'cboard.symbol.please',
  'cboard.symbol.thankYou',
  'cboard.symbol.youAre',
  'cboard.symbol.your'
])

const CBOARD_LABEL_KEYS = new Set([
  'cboard.symbol.actions',
  'cboard.symbol.activities',
  'cboard.symbol.animals',
  'cboard.symbol.birds',
  'cboard.symbol.clothingAccessories',
  'cboard.symbol.emotions',
  'cboard.symbol.hygiene',
  'cboard.symbol.insects',
  'cboard.symbol.kitchen',
  'cboard.symbol.marineAnimals',
  'cboard.symbol.people',
  'cboard.symbol.plants',
  'cboard.symbol.position',
  'cboard.symbol.quickChat',
  'cboard.symbol.sports',
  'cboard.symbol.weather',
  'cboard.symbol.wildAnimals'
])

function resolveProviderFolder(labelKey: string) {
  if (ARASAAC_LABEL_KEYS.has(labelKey)) return 'arasaac'
  if (CBOARD_LABEL_KEYS.has(labelKey)) return 'cboard'
  return 'mulberry'
}

export function resolveCboardDefaultPictogramAttribution(
  tile: CboardDefaultTileSource
): PictogramAttribution {
  if (tile.pictogramProvider && tile.pictogramOriginalId) {
    const declaredAttribution = getPictogramAttribution(tile)
    if (declaredAttribution) return declaredAttribution
  }

  const labelKey = String(tile.labelKey || '').trim()
  const providerFolder = resolveProviderFolder(labelKey)
  const attribution = getPictogramAttribution({
    id: tile.id,
    image: `/symbols/${providerFolder}/${labelKey || tile.id}`
  })

  if (!attribution) {
    throw new Error(`Missing CBoard default attribution for tile ${tile.id}`)
  }

  return attribution
}
