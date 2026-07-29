import { describe, expect, test } from 'vitest'

import { DEFAULT_BOARD_TILES } from './defaultBoard'

const REVIEWED_MIXED_SCRIPT_LABEL_KEYS = new Set([
  'symbol.clothesGeneral.t-Shirt',
  'symbol.peopleProfession.itAssistant',
  'symbol.electricalMedia.playstation',
  'symbol.electricalComputer.usbStick',
  'symbol.electricalMedia.ipod',
  'symbol.electricalMedia.dvdPlayer',
  'symbol.electricalMedia.wii',
  'symbol.healthcareMedicalItems.xray'
])

function getTileLabel(keyPath: string) {
  const tile = DEFAULT_BOARD_TILES.find(item => item.keyPath === keyPath)

  expect(tile).toBeDefined()
  expect(tile?.vocalization).toBe(tile?.label)
  return tile!.label
}

describe('CBoard Chinese tile label overrides', () => {
  test.each([
    ['cboard.symbol.iDislike', '我不喜欢'],
    ['symbol.foodVegetablesAndSalads.lettuce', '生菜'],
    ['symbol.healthcareMedicalItems.syringe', '注射器'],
    ['symbol.peopleRelationship.grandmother', '奶奶'],
    ['symbol.animalMammal.giraffe', '长颈鹿'],
    ['symbol.animalSpidersAndInsects.beetle', '甲虫'],
    ['symbol.animalBirds.owl', '猫头鹰'],
    ['symbol.foodEggs.boiledEgg', '煮鸡蛋'],
    ['symbol.foodIngredients.tomatoSauce', '番茄酱'],
    ['symbol.healthcareGroomingItems.sanitaryTowel', '卫生巾'],
    ['symbol.animalMammal.cat', '猫'],
    ['symbol.healthcareBodyParts.thumb', '拇指']
  ])('uses the reviewed Chinese label and vocalization for %s', (keyPath, label) => {
    expect(getTileLabel(keyPath)).toBe(label)
  })

  test('does not expose unreviewed English or trailing colons in patient tiles', () => {
    const unreviewed = DEFAULT_BOARD_TILES.filter(tile => {
      if (tile.loadBoardId || REVIEWED_MIXED_SCRIPT_LABEL_KEYS.has(tile.keyPath)) {
        return false
      }

      return /[A-Za-z]/.test(tile.label) || /[:：]$/.test(tile.label)
    }).map(tile => ({ keyPath: tile.keyPath, label: tile.label }))

    expect(unreviewed).toEqual([])
  })
})
