import { isPublicBoardBundle } from '@cboard-communication-core/publicBoardLibrary'

export interface PublicBoardSummary {
  id: string
  name: string
  author: string
  tileCount: number
}

export interface PublicBoardSearchResult {
  boards: PublicBoardSummary[]
  total: number
  page: number
}

export interface PublicBoardLibraryPort {
  readonly configured: boolean
  search(options?: {
    search?: string
    page?: number
    limit?: number
  }): Promise<PublicBoardSearchResult>
  getBundle(id: string): Promise<unknown>
}

interface PublicBoardLibraryDependencies {
  apiBaseUrl: string
  request: (options: {
    url: string
    method: 'GET'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function hasHttpOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function toSummary(value: unknown): PublicBoardSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const id = String(record.id || '').trim()
  const name = String(record.name || '').trim()
  if (!id || !name) return null
  return {
    id,
    name,
    author: String(record.author || '').trim() || '未署名作者',
    tileCount: Array.isArray(record.tiles)
      ? record.tiles.length
      : Math.max(0, Number(record.tileCount) || 0)
  }
}

function resolveTrustedApiMediaUrl(value: unknown, apiBaseUrl: string) {
  const path = String(value || '').trim()
  if (!path.startsWith('/board/public/')) return ''
  try {
    const apiUrl = new URL(apiBaseUrl)
    const mediaUrl = new URL(path, apiUrl)
    return mediaUrl.origin === apiUrl.origin ? mediaUrl.href : ''
  } catch (error) {
    return ''
  }
}

export function normalizePublicBoardBundleMediaUrls(
  value: unknown,
  apiBaseUrl: string
) {
  const bundle = asRecord(value)
  if (!bundle || !Array.isArray(bundle.data)) return value
  return {
    ...bundle,
    data: bundle.data.map(boardValue => {
      const board = asRecord(boardValue)
      if (!board || !Array.isArray(board.tiles)) return boardValue
      return {
        ...board,
        tiles: board.tiles.map(tileValue => {
          const tile = asRecord(tileValue)
          if (!tile) return tileValue
          const offlineImageUrl = resolveTrustedApiMediaUrl(
            tile.offlineImagePath,
            apiBaseUrl
          )
          if (!offlineImageUrl) return { ...tile, offlineImagePath: '' }
          return { ...tile, offlineImagePath: offlineImageUrl }
        })
      }
    })
  }
}

export function createPublicBoardLibraryPort(
  dependencies: PublicBoardLibraryDependencies
): PublicBoardLibraryPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = hasHttpOrigin(apiBaseUrl)

  const requireConfiguration = () => {
    if (!configured) {
      throw new Error('尚未配置手机可访问的 cboard-api 地址。')
    }
  }

  return {
    configured,

    async search(options = {}) {
      requireConfiguration()
      const page = positiveInteger(options.page, 1)
      const limit = Math.min(20, positiveInteger(options.limit, 10))
      const search = String(options.search || '').trim().slice(0, 80)
      const response = await dependencies.request({
        url:
          `${apiBaseUrl}/board/public?page=${page}` +
          `&limit=${limit}&search=${encodeURIComponent(search)}`,
        method: 'GET',
        header: { Accept: 'application/json' }
      })
      const body = asRecord(response.data)
      if (response.statusCode !== 200 || !body || !Array.isArray(body.data)) {
        throw new Error('公共沟通板服务返回了无法识别的数据。')
      }
      return {
        boards: body.data
          .map(toSummary)
          .filter((board): board is PublicBoardSummary => Boolean(board)),
        total: Math.max(0, Number(body.total) || 0),
        page: positiveInteger(body.page, page)
      }
    },

    async getBundle(id) {
      requireConfiguration()
      const boardId = String(id || '').trim()
      if (!boardId) throw new TypeError('公共沟通板 id 不能为空。')
      const response = await dependencies.request({
        url: `${apiBaseUrl}/board/public/${encodeURIComponent(boardId)}/bundle`,
        method: 'GET',
        header: { Accept: 'application/json' }
      })
      if (response.statusCode !== 200 || !isPublicBoardBundle(response.data)) {
        throw new Error('公共沟通板已下架、不可用或数据不完整。')
      }
      return normalizePublicBoardBundleMediaUrls(response.data, apiBaseUrl)
    }
  }
}
