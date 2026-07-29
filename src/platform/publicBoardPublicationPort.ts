export type PublicBoardPublicationAssetKind = 'image' | 'video' | 'sound'

export interface PublicBoardPublicationIdentity {
  token: string
  email: string
}

export interface OwnedCboardBoard extends Record<string, unknown> {
  id: string
  name: string
  isPublic: boolean
}

export interface PublicBoardPublicationPort {
  readonly configured: boolean
  getIdentity(): PublicBoardPublicationIdentity | null
  listOwnedBoards(): Promise<OwnedCboardBoard[]>
  uploadMedia(
    source: string,
    kind: PublicBoardPublicationAssetKind
  ): Promise<string>
  createBoard(board: Record<string, unknown>): Promise<{ id: string }>
  updateBoard(
    id: string,
    board: Record<string, unknown>
  ): Promise<void>
  deleteBoard(id: string): Promise<void>
}

interface PublicBoardPublicationPortDependencies {
  apiBaseUrl: string
  getIdentity: () => PublicBoardPublicationIdentity | null
  request: (options: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    data?: unknown
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data?: unknown }>
  uploadFile: (options: {
    url: string
    filePath: string
    name: 'file'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data?: unknown }>
}

function normalizeBaseUrl(value: string) {
  const normalized = String(value || '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/]+/i.test(normalized) ? normalized : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseResponseData(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function asOwnedBoard(value: unknown): OwnedCboardBoard | null {
  const board = asRecord(value)
  if (!board) return null
  const id = String(board.id || board._id || '').trim()
  if (!id) return null
  return {
    ...board,
    id,
    name: String(board.name || board.nameKey || '未命名沟通板').trim(),
    isPublic: Boolean(board.isPublic)
  }
}

function requireSuccessfulResponse(
  response: { statusCode: number; data?: unknown },
  action: string
) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${action}失败（HTTP ${response.statusCode}）`)
  }
  return asRecord(parseResponseData(response.data))
}

function requireIdentity(
  dependencies: PublicBoardPublicationPortDependencies
) {
  const identity = dependencies.getIdentity()
  const token = String(identity && identity.token || '').trim()
  const email = String(identity && identity.email || '').trim()
  if (!token || !email) {
    throw new Error('请先登录 CBoard 账号，再发布公共沟通板。')
  }
  return { token, email }
}

export function createPublicBoardPublicationPort(
  dependencies: PublicBoardPublicationPortDependencies
): PublicBoardPublicationPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)

  const authenticatedHeader = () => {
    const identity = requireIdentity(dependencies)
    return {
      identity,
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${identity.token}`
      }
    }
  }

  return {
    configured: Boolean(apiBaseUrl),

    getIdentity() {
      if (!apiBaseUrl) return null
      const identity = dependencies.getIdentity()
      const token = String(identity && identity.token || '').trim()
      const email = String(identity && identity.email || '').trim()
      return token && email ? { token, email } : null
    },

    async listOwnedBoards() {
      if (!apiBaseUrl) throw new Error('尚未配置可访问的 CBoard API。')
      const { identity, header } = authenticatedHeader()
      const boards: OwnedCboardBoard[] = []
      const pageSize = 100
      let page = 1
      let total = Number.POSITIVE_INFINITY

      while (boards.length < total) {
        const response = await dependencies.request({
          url:
            `${apiBaseUrl}/board/byemail/${encodeURIComponent(identity.email)}` +
            `?page=${page}&limit=${pageSize}&offset=0&sort=-_id&search=`,
          method: 'GET',
          header
        })
        const body = requireSuccessfulResponse(response, '读取我的沟通板')
        const data = body && Array.isArray(body.data) ? body.data : []
        const pageBoards = data
          .map(asOwnedBoard)
          .filter((board): board is OwnedCboardBoard => Boolean(board))
        boards.push(...pageBoards)

        const reportedTotal = Number(body && body.total)
        total = Number.isFinite(reportedTotal)
          ? Math.max(0, reportedTotal)
          : boards.length
        if (!data.length || boards.length >= total) break
        page += 1
        if (page > 50) {
          throw new Error('我的沟通板数量超过安全读取上限。')
        }
      }

      return boards
    },

    async uploadMedia(source, kind) {
      if (!apiBaseUrl) throw new Error('尚未配置可访问的 CBoard API。')
      const { identity } = authenticatedHeader()
      const response = await dependencies.uploadFile({
        url: `${apiBaseUrl}/media`,
        filePath: source,
        name: 'file',
        header: { Authorization: `Bearer ${identity.token}` }
      })
      const body = requireSuccessfulResponse(response, `上传${kind}`)
      const url = String(body && body.url || '').trim()
      if (!/^https:\/\//i.test(url)) {
        throw new Error('媒体上传成功，但服务器没有返回安全地址。')
      }
      return url
    },

    async createBoard(board) {
      if (!apiBaseUrl) throw new Error('尚未配置可访问的 CBoard API。')
      const { header } = authenticatedHeader()
      const response = await dependencies.request({
        url: `${apiBaseUrl}/board`,
        method: 'POST',
        data: board,
        header
      })
      const body = requireSuccessfulResponse(response, '创建私有沟通板')
      const id = String(body && (body.id || body._id) || '').trim()
      if (!id) throw new Error('服务器没有返回沟通板 ID。')
      return { id }
    },

    async updateBoard(id, board) {
      if (!apiBaseUrl) throw new Error('尚未配置可访问的 CBoard API。')
      const { header } = authenticatedHeader()
      const response = await dependencies.request({
        url: `${apiBaseUrl}/board/${encodeURIComponent(id)}`,
        method: 'PUT',
        data: board,
        header
      })
      requireSuccessfulResponse(response, '更新沟通板')
    },

    async deleteBoard(id) {
      if (!apiBaseUrl) return
      const { header } = authenticatedHeader()
      const response = await dependencies.request({
        url: `${apiBaseUrl}/board/${encodeURIComponent(id)}`,
        method: 'DELETE',
        header
      })
      requireSuccessfulResponse(response, '删除沟通板')
    }
  }
}
