import { describe, expect, test } from 'vitest'
import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
import { preserveCareLocalTileMedia } from './careLocalMediaProjection'

const scope = {
  accountId: 'account-a',
  familyId: 'family-a',
  profileId: 'profile-a'
}

function tile(id: string, overrides: Partial<TileDTO> = {}): TileDTO {
  return {
    dtoType: 'TileDTO',
    version: 1,
    id,
    boardId: 'board-a',
    label: id,
    vocalization: id,
    image: `cloud:${id}`,
    mediaType: 'image',
    video: '',
    sound: '',
    backgroundColor: '',
    keyPath: '',
    loadBoardId: '',
    communication: { synonyms: [], relatedTerms: [], excludeTokens: [], category: '' },
    ...overrides
  }
}

function board(id: string, tiles: TileDTO[]): BoardDTO {
  const boardTiles = tiles.map(item => ({ ...item, boardId: id }))
  return {
    dtoType: 'BoardDTO',
    version: 1,
    id,
    name: id,
    nameKey: '',
    category: '',
    layout: { columns: 4, rows: Math.max(1, Math.ceil(boardTiles.length / 4)), tileIds: boardTiles.map(item => item.id) },
    tiles: boardTiles
  }
}

describe('preserveCareLocalTileMedia', () => {
  test('retains same-scope local audio/video through repeated cloud projections', () => {
    const local = [board('board-a', [tile('tile-a', {
      mediaType: 'video',
      video: 'wxfile://local-video.mp4',
      sound: 'wxfile://local-sound.mp3'
    })])]
    const cloud = [board('board-a', [tile('tile-a')])]

    const first = preserveCareLocalTileMedia(cloud, local, scope, scope)
    const second = preserveCareLocalTileMedia(cloud, first, scope, scope)

    expect(second[0].tiles[0]).toMatchObject({
      mediaType: 'video',
      video: 'wxfile://local-video.mp4',
      sound: 'wxfile://local-sound.mp3'
    })
  })

  test('does not inject local-only entries and never restores cloud-deleted tiles or boards', () => {
    const local = [
      board('board-a', [tile('tile-a', { sound: 'wxfile://sound.mp3' }), tile('deleted-tile', { video: 'wxfile://deleted.mp4' })]),
      board('deleted-board', [tile('deleted-board-tile', { sound: 'wxfile://other.mp3' })])
    ]
    const cloud = [board('board-a', [tile('tile-a'), tile('cloud-only')])]

    const result = preserveCareLocalTileMedia(cloud, local, scope, scope)

    expect(result).toHaveLength(1)
    expect(result[0].tiles.map(item => item.id)).toEqual(['tile-a', 'cloud-only'])
    expect(result[0].tiles[0].sound).toBe('wxfile://sound.mp3')
    expect(result[0].tiles[1].sound).toBe('')
  })

  test('keeps cloud label and image updates while restoring only local media fields', () => {
    const local = [board('board-a', [tile('tile-a', {
      label: 'old local label',
      image: 'old-local-image',
      mediaType: 'video',
      video: 'wxfile://local.mp4',
      sound: 'wxfile://local.mp3'
    })])]
    const cloud = [board('board-a', [tile('tile-a', {
      label: 'new cloud label',
      image: 'new-cloud-image'
    })])]

    const [result] = preserveCareLocalTileMedia(cloud, local, scope, scope)

    expect(result.tiles[0]).toMatchObject({
      label: 'new cloud label',
      image: 'new-cloud-image',
      mediaType: 'video',
      video: 'wxfile://local.mp4',
      sound: 'wxfile://local.mp3'
    })
  })

  test('does not carry media across account, family, or profile scope changes', () => {
    const local = [board('board-a', [tile('tile-a', {
      mediaType: 'video',
      video: 'wxfile://account-a.mp4',
      sound: 'wxfile://account-a.mp3'
    })])]
    const cloud = [board('board-a', [tile('tile-a')])]

    for (const otherScope of [
      { ...scope, accountId: 'account-b' },
      { ...scope, familyId: 'family-b' },
      { ...scope, profileId: 'profile-b' }
    ]) {
      expect(preserveCareLocalTileMedia(cloud, local, scope, otherScope)).toBe(cloud)
    }
  })
})
