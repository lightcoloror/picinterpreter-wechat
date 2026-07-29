import { describe, expect, test, vi } from 'vitest'

import { createPublicBoardLibraryPort } from './publicBoardLibraryPort'

function bundle() {
  return {
    format: 'cboard-public-board-bundle',
    contractVersion: 1,
    rootBoardId: 'root',
    source: 'cboard-public',
    sourceUrl: 'https://github.com/cboard-org/cboard',
    licenseStatus: 'unknown',
    warnings: [],
    data: [{ id: 'root', name: '首页', author: '作者', tiles: [] }],
    diagnostics: {
      boardCount: 1,
      tileCount: 0,
      unavailableLinkedBoardCount: 0
    }
  }
}

describe('publicBoardLibraryPort', () => {
  test('searches public boards without forwarding owner email fields', async () => {
    const request = vi.fn(async () => ({
      statusCode: 200,
      data: {
        total: 1,
        page: 1,
        data: [{
          id: 'root',
          name: '日常沟通',
          author: '照护者',
          email: 'private@example.test',
          tiles: [{ id: 'water' }]
        }]
      }
    }))
    const port = createPublicBoardLibraryPort({
      apiBaseUrl: 'https://api.example.test/',
      request
    })

    await expect(port.search({ search: '日常 沟通' })).resolves.toEqual({
      boards: [{
        id: 'root',
        name: '日常沟通',
        author: '照护者',
        tileCount: 1
      }],
      total: 1,
      page: 1
    })
    expect(request).toHaveBeenCalledWith({
      url: 'https://api.example.test/board/public?page=1&limit=10&search=%E6%97%A5%E5%B8%B8%20%E6%B2%9F%E9%80%9A',
      method: 'GET',
      header: { Accept: 'application/json' }
    })
  })

  test('accepts only the bounded public bundle contract', async () => {
    const base = bundle()
    const value = {
      ...base,
      data: [{
        ...base.data[0],
        tiles: [{
          id: 'water',
          image: 'https://cdn.example.test/water.png',
          offlineImagePath: '/board/public/root/tile/water/image'
        }]
      }]
    }
    const request = vi.fn(async () => ({ statusCode: 200, data: value }))
    const port = createPublicBoardLibraryPort({
      apiBaseUrl: 'https://api.example.test',
      request
    })

    await expect(port.getBundle('root')).resolves.toEqual({
      ...value,
      data: [{
        ...value.data[0],
        tiles: [{
          id: 'water',
          image: 'https://cdn.example.test/water.png',
          offlineImagePath:
            'https://api.example.test/board/public/root/tile/water/image'
        }]
      }]
    })
    expect(request).toHaveBeenCalledWith({
      url: 'https://api.example.test/board/public/root/bundle',
      method: 'GET',
      header: { Accept: 'application/json' }
    })
  })

  test('fails before network access when the API is not configured', async () => {
    const request = vi.fn()
    const port = createPublicBoardLibraryPort({ apiBaseUrl: '', request })

    expect(port.configured).toBe(false)
    await expect(port.search()).rejects.toThrow('尚未配置')
    expect(request).not.toHaveBeenCalled()
  })
})
