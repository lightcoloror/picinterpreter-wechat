import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
import { describe, expect, test, vi } from 'vitest'

import type { PublicBoardPublicationPort } from '../../platform/publicBoardPublicationPort'
import { createPublicBoardPublicationService } from './publicBoardPublicationService'

const tile = (id: string, boardId: string, values = {}): TileDTO => ({
  dtoType: 'TileDTO',
  version: 1,
  id,
  boardId,
  label: id,
  vocalization: id,
  image: `wxfile://${id}.png`,
  mediaType: 'image',
  video: '',
  sound: '',
  backgroundColor: '#fff',
  keyPath: '',
  loadBoardId: '',
  communication: {
    synonyms: [],
    relatedTerms: [],
    excludeTokens: [],
    category: ''
  },
  ...values
})

const board = (id: string, tiles: TileDTO[]): BoardDTO => ({
  dtoType: 'BoardDTO',
  version: 1,
  id,
  name: id,
  nameKey: '',
  category: '',
  layout: {
    columns: 2,
    rows: Math.max(1, Math.ceil(tiles.length / 2)),
    tileIds: tiles.map(value => value.id)
  },
  tiles
})

const declaration = {
  author: '家庭贡献者',
  description: '公开沟通板',
  licenseId: 'cc-by-4.0' as const,
  rightsConfirmed: true,
  privacyConfirmed: true
}

function createHarness(values: {
  updateFailureAt?: number
  configured?: boolean
  authenticated?: boolean
} = {}) {
  let nextId = 0
  let updateCount = 0
  const port: PublicBoardPublicationPort = {
    configured: values.configured !== false,
    getIdentity: () =>
      values.authenticated === false
        ? null
        : { token: 'token', email: 'caregiver@example.com' },
    listOwnedBoards: vi.fn(async () => []),
    uploadMedia: vi.fn(async source =>
      `https://cdn.example.test/${encodeURIComponent(source)}`
    ),
    createBoard: vi.fn(async () => ({ id: `server-${++nextId}` })),
    updateBoard: vi.fn(async () => {
      updateCount += 1
      if (values.updateFailureAt === updateCount) {
        throw new Error('server update failed')
      }
    }),
    deleteBoard: vi.fn(async () => undefined)
  }
  return {
    port,
    service: createPublicBoardPublicationService({ port })
  }
}

describe('publicBoardPublicationService', () => {
  test('creates private placeholders, uploads once and publishes the root last', async () => {
    const rootId = 'device_private_board_root'
    const childId = 'device_private_board_child'
    const boards = [
      board(rootId, [
        tile('open-child', rootId, {
          loadBoardId: childId,
          image: 'wxfile://shared.png'
        }),
        tile('water', rootId, { image: 'wxfile://shared.png' })
      ]),
      board(childId, [tile('drink', childId)])
    ]
    const harness = createHarness()
    const progress = vi.fn()

    const result = await harness.service.publish(
      boards,
      rootId,
      declaration,
      progress
    )

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        rootBoardId: 'server-1',
        boardCount: 2,
        tileCount: 3
      })
    )
    expect(harness.port.createBoard).toHaveBeenCalledTimes(2)
    expect(harness.port.createBoard).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: false, tiles: [] })
    )
    expect(harness.port.uploadMedia).toHaveBeenCalledTimes(2)
    expect(harness.port.updateBoard).toHaveBeenCalledTimes(2)
    expect(vi.mocked(harness.port.updateBoard).mock.calls[0][0]).toBe(
      'server-2'
    )
    expect(vi.mocked(harness.port.updateBoard).mock.calls[1][0]).toBe(
      'server-1'
    )
    expect(harness.port.deleteBoard).not.toHaveBeenCalled()
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'publishing', completed: 2 })
    )
  })

  test('rolls back every created board when publication fails', async () => {
    const rootId = 'device_private_board_root'
    const childId = 'device_private_board_child'
    const boards = [
      board(rootId, [
        tile('open-child', rootId, { loadBoardId: childId })
      ]),
      board(childId, [tile('drink', childId)])
    ]
    const harness = createHarness({ updateFailureAt: 2 })

    const result = await harness.service.publish(
      boards,
      rootId,
      declaration
    )

    expect(result.ok).toBe(false)
    expect(harness.port.deleteBoard).toHaveBeenCalledTimes(2)
    expect(vi.mocked(harness.port.deleteBoard).mock.calls).toEqual([
      ['server-2'],
      ['server-1']
    ])
  })

  test('does not touch the network before configuration and consent pass', async () => {
    const boards = [
      board('device_private_board_root', [
        tile('water', 'device_private_board_root')
      ])
    ]
    const harness = createHarness()

    const result = await harness.service.publish(
      boards,
      'device_private_board_root',
      { ...declaration, privacyConfirmed: false }
    )

    expect(result.ok).toBe(false)
    expect(harness.port.createBoard).not.toHaveBeenCalled()
    expect(harness.port.uploadMedia).not.toHaveBeenCalled()
  })
})
