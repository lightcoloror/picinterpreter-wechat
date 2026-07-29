import { EMERGENCY_COMMUNICATION_PHRASES } from '@cboard-communication-core/emergencyCommunication'
import { describe, expect, test } from 'vitest'

import emergencyCboardImages from '../../assets/emergency/cboard-images.json'
import { getDefaultTileById } from '../../fixtures/defaultBoard'
import { getEmergencyCommunicationImage } from './emergencyAssets'

describe('emergency communication images', () => {
  test('provides a packaged image for every validated emergency phrase', () => {
    const images = EMERGENCY_COMMUNICATION_PHRASES.map(phrase =>
      getEmergencyCommunicationImage(phrase.id)
    )

    expect(images).toHaveLength(8)
    expect(
      images.every(
        image =>
          image.startsWith('/assets/') ||
          image.startsWith('/packages/emergency/assets/')
      )
    ).toBe(true)
    expect(getEmergencyCommunicationImage('uncomfortable')).toBe(
      '/packages/emergency/assets/emergency/uncomfortable.png'
    )
    expect(getEmergencyCommunicationImage('toilet')).toBe(
      '/packages/emergency/assets/emergency/toilet.png'
    )
  })

  test('does not guess an image for an unknown emergency phrase', () => {
    expect(getEmergencyCommunicationImage('unknown')).toBe('')
  })

  test('keeps the emergency CBoard manifest aligned with stable tiles', () => {
    emergencyCboardImages.assets.forEach(asset => {
      const tile = getDefaultTileById(asset.tileId)
      expect(tile).not.toBeNull()
      expect(tile?.image).toBe(
        `/assets/cboard-default/${asset.file}`
      )
      expect(getEmergencyCommunicationImage(asset.phraseId)).toBe(
        `/assets/cboard-default/${asset.file}`
      )
    })
  })
})
