import { describe, expect, it } from 'vitest'
import { createPersonalCommunicationBoard } from '@cboard-communication-core/boardManagement'
import { createBoardDTO } from '@cboard-communication-core/dto'
import { searchExpressionPictograms } from '@cboard-communication-core/expressionPictogramSearch'
import {
  CURATED_PUBLIC_PICTOGRAM_ID_PREFIX,
  createCuratedPublicPictogram,
  listCuratedPublicPictograms,
  removeCuratedPublicPictogram
} from '@cboard-communication-core/publicPictogramCuration'

import { createPictureLibraryStore } from '../../platform/pictureLibraryStore'

function createLibrary() {
  const source = createBoardDTO({
    id: 'food',
    name: '饮食',
    tiles: [
      {
        id: 'apple',
        label: '苹果',
        image: 'https://example.test/apple.svg',
        communicationSynonyms: '水果,红苹果',
        pictogramAttribution: {
          provider: 'arasaac',
          originalId: 'apple',
          name: 'ARASAAC',
          license: 'CC BY-NC-SA 4.0',
          licenseUrl:
            'https://creativecommons.org/licenses/by-nc-sa/4.0/',
          author: 'Sergio Palao',
          authorUrl: 'https://arasaac.org/',
          sourceUrl: 'https://arasaac.org/',
          repoKey: 'arasaac'
        }
      }
    ]
  })
  return createPersonalCommunicationBoard([source], {
    id: 'device_private_board_daily',
    name: '我的日常',
    columns: 3
  }).boards
}

describe('curated public pictogram storage integration', () => {
  it('survives reload, enters matching and can be removed safely', () => {
    const values = new Map<string, unknown>()
    const store = createPictureLibraryStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      createLibrary()
    )
    const initial = store.load()
    const curated = createCuratedPublicPictogram(initial, {
      id: `${CURATED_PUBLIC_PICTOGRAM_ID_PREFIX}persisted`,
      targetBoardId: 'device_private_board_daily',
      sourceTile: initial[0].tiles[0]
    })

    store.save(curated.boards)
    const reloaded = store.load()
    const match = searchExpressionPictograms(
      reloaded,
      '水果'
    ).matches.find(item => item.tile.id === curated.tile.id)

    expect(listCuratedPublicPictograms(reloaded)).toHaveLength(1)
    expect(match?.boardId).toBe('device_private_board_daily')
    expect(match?.tile.label).toBe('苹果')

    const removed = removeCuratedPublicPictogram(
      reloaded,
      'device_private_board_daily',
      curated.tile.id
    )
    expect(removed).not.toBeNull()
    store.save(removed!.boards)
    expect(listCuratedPublicPictograms(store.load())).toEqual([])
    expect(store.load()[0].tiles[0].id).toBe('apple')
  })
})
