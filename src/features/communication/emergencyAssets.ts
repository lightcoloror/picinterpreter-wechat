import emergencyCboardImages from '../../assets/emergency/cboard-images.json'

const CBOARD_IMAGE_BY_PHRASE_ID: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      emergencyCboardImages.assets.map(asset => [
        asset.phraseId,
        `/assets/cboard-default/${asset.file}`
      ])
    )
  )

const PACKAGED_IMAGE_BY_PHRASE_ID: Readonly<Record<string, string>> =
  Object.freeze({
    uncomfortable: '/packages/emergency/assets/emergency/uncomfortable.png',
    toilet: '/packages/emergency/assets/emergency/toilet.png'
  })

export function getEmergencyCommunicationImage(phraseId: string) {
  const packagedImage = PACKAGED_IMAGE_BY_PHRASE_ID[phraseId]
  if (packagedImage) return packagedImage

  return CBOARD_IMAGE_BY_PHRASE_ID[phraseId] || ''
}
