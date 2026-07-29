import { describe, expect, test, vi } from 'vitest'

import type { PublicBoardPublicationPort } from '../../platform/publicBoardPublicationPort'
import { createPublicBoardManagementService } from './publicBoardManagementService'

function createHarness(values: {
  configured?: boolean
  authenticated?: boolean
} = {}) {
  const port: PublicBoardPublicationPort = {
    configured: values.configured !== false,
    getIdentity: () =>
      values.authenticated === false
        ? null
        : { token: 'token', email: 'caregiver@example.com' },
    listOwnedBoards: vi.fn(async () => [
      { id: 'public', name: '公开板', isPublic: true },
      { id: 'private', name: '私有板', isPublic: false }
    ]),
    uploadMedia: vi.fn(),
    createBoard: vi.fn(),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn()
  }
  return {
    port,
    service: createPublicBoardManagementService({ port })
  }
}

describe('publicBoardManagementService', () => {
  test('lists only public boards owned by the authenticated account', async () => {
    const harness = createHarness()

    await expect(harness.service.listOwnedPublicBoards()).resolves.toEqual([
      { id: 'public', name: '公开板', isPublic: true }
    ])
  })

  test('reuses the native CBoard visibility toggle and delete actions', async () => {
    const harness = createHarness()
    const board = { id: 'public', name: '公开板', isPublic: true }

    await harness.service.unpublishBoard(board)
    await harness.service.deleteBoard(board.id)

    expect(harness.port.updateBoard).toHaveBeenCalledWith(
      'public',
      expect.objectContaining({ id: 'public', isPublic: false })
    )
    expect(harness.port.deleteBoard).toHaveBeenCalledWith('public')
  })

  test('fails before network access without configuration or login', async () => {
    const unconfigured = createHarness({ configured: false })
    const unauthenticated = createHarness({ authenticated: false })

    await expect(
      unconfigured.service.listOwnedPublicBoards()
    ).rejects.toThrow('尚未配置')
    await expect(
      unauthenticated.service.listOwnedPublicBoards()
    ).rejects.toThrow('请先登录')
    expect(unconfigured.port.listOwnedBoards).not.toHaveBeenCalled()
    expect(unauthenticated.port.listOwnedBoards).not.toHaveBeenCalled()
  })
})
