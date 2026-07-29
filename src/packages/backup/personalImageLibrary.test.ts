import { describe, expect, it } from 'vitest'
import {
  createBoardDTO,
  type BoardDTO
} from '@cboard-communication-core/dto'

import { rebasePersonalImageLibraryBoards } from './personalImageLibrary'

function createBoards(): BoardDTO[] {
  return [
    createBoardDTO({
      id: 'root',
      name: '主页',
      tiles: [
        {
          id: 'packaged',
          label: '是',
          image:
            '/packages/caregiver/assets/cboard-default/yes.png'
        },
        {
          id: 'legacy-backup',
          label: '不',
          image:
            '/packages/backup/assets/cboard-default/no.png'
        },
        {
          id: 'private',
          label: '家人',
          image: 'wxfile://private/family.png'
        }
      ]
    })
  ]
}

describe('rebasePersonalImageLibraryBoards', () => {
  it('points legacy bundled images at the shared main-package assets without mutating input', () => {
    const source = createBoards()
    const sourcePrivateTile = source[0].tiles[2]

    const result = rebasePersonalImageLibraryBoards(source)

    expect(result[0].tiles[0].image).toBe(
      '/assets/cboard-default/yes.png'
    )
    expect(result[0].tiles[1].image).toBe(
      '/assets/cboard-default/no.png'
    )
    expect(source[0].tiles[0].image).toBe(
      '/packages/caregiver/assets/cboard-default/yes.png'
    )
    expect(result[0].tiles[2]).toBe(sourcePrivateTile)
    expect(result[0].tiles[2].image).toBe(
      'wxfile://private/family.png'
    )
  })

  it('preserves board identity when no packaged path needs rebasing', () => {
    const source = createBoards()
    source[0] = {
      ...source[0],
      tiles: [source[0].tiles[2]]
    }

    const result = rebasePersonalImageLibraryBoards(source)

    expect(result[0]).toBe(source[0])
  })
})
