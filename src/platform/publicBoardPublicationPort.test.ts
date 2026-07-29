import { describe, expect, test, vi } from 'vitest'

import { createPublicBoardPublicationPort } from './publicBoardPublicationPort'

function createHarness() {
  const request = vi.fn(async options => {
    if (options.method === 'GET') {
      return {
        statusCode: 200,
        data: {
          total: 2,
          data: [
            { id: 'public-board', name: '公开板', isPublic: true },
            { _id: 'private-board', name: '私有板', isPublic: false }
          ]
        }
      }
    }
    return {
      statusCode: 200,
      data:
        options.method === 'POST'
          ? { id: 'server-board' }
          : { ok: true }
    }
  })
  const uploadFile = vi.fn(async () => ({
    statusCode: 200,
    data: JSON.stringify({ url: 'https://cdn.example.test/image.png' })
  }))
  const port = createPublicBoardPublicationPort({
    apiBaseUrl: 'https://api.example.test/',
    getIdentity: () => ({
      token: 'secret-token',
      email: 'caregiver@example.com'
    }),
    request,
    uploadFile
  })
  return { port, request, uploadFile }
}

describe('publicBoardPublicationPort', () => {
  test('reuses authenticated CBoard board and media endpoints', async () => {
    const harness = createHarness()

    await expect(
      harness.port.uploadMedia('wxfile://image.png', 'image')
    ).resolves.toBe('https://cdn.example.test/image.png')
    await expect(
      harness.port.createBoard({ name: '测试板' })
    ).resolves.toEqual({ id: 'server-board' })
    await harness.port.updateBoard('server-board', { isPublic: true })
    await harness.port.deleteBoard('server-board')
    await expect(harness.port.listOwnedBoards()).resolves.toEqual([
      expect.objectContaining({ id: 'public-board', isPublic: true }),
      expect.objectContaining({ id: 'private-board', isPublic: false })
    ])

    expect(harness.uploadFile).toHaveBeenCalledWith({
      url: 'https://api.example.test/media',
      filePath: 'wxfile://image.png',
      name: 'file',
      header: { Authorization: 'Bearer secret-token' }
    })
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://api.example.test/board/byemail/' +
          'caregiver%40example.com?page=1&limit=100&offset=0&sort=-_id&search=',
        method: 'GET'
      })
    )
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/board',
        method: 'POST',
        header: expect.objectContaining({
          Authorization: 'Bearer secret-token'
        })
      })
    )
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/board/server-board',
        method: 'PUT'
      })
    )
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/board/server-board',
        method: 'DELETE'
      })
    )
  })

  test('fails before network access when API or account is unavailable', async () => {
    const request = vi.fn()
    const uploadFile = vi.fn()
    const unconfigured = createPublicBoardPublicationPort({
      apiBaseUrl: '',
      getIdentity: () => null,
      request,
      uploadFile
    })

    expect(unconfigured.configured).toBe(false)
    expect(unconfigured.getIdentity()).toBeNull()
    await expect(
      unconfigured.createBoard({ name: '测试板' })
    ).rejects.toThrow('尚未配置')
    await expect(unconfigured.listOwnedBoards()).rejects.toThrow('尚未配置')
    expect(request).not.toHaveBeenCalled()
    expect(uploadFile).not.toHaveBeenCalled()
  })

  test('rejects malformed upload responses', async () => {
    const harness = createHarness()
    harness.uploadFile.mockResolvedValueOnce({
      statusCode: 200,
      data: JSON.stringify({ url: 'http://unsafe.example.test/image.png' })
    })

    await expect(
      harness.port.uploadMedia('wxfile://image.png', 'image')
    ).rejects.toThrow('安全地址')
  })

  test('paginates the authenticated owner board list', async () => {
    const harness = createHarness()
    harness.request
      .mockResolvedValueOnce({
        statusCode: 200,
        data: {
          total: 101,
          data: Array.from({ length: 100 }, (_, index) => ({
            id: `board-${index}`,
            name: `板 ${index}`,
            isPublic: true
          }))
        }
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        data: {
          total: 101,
          data: [{ id: 'board-100', name: '板 100', isPublic: false }]
        }
      })

    await expect(harness.port.listOwnedBoards()).resolves.toHaveLength(101)
    expect(harness.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('page=2&limit=100'),
        method: 'GET'
      })
    )
  })
})
