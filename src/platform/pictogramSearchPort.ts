import {
  normalizeRuntimePictogram as normalizeCoreRuntimePictogram
} from '@cboard-communication-core/runtimePictogram'

export interface RuntimePictogramSource {
  provider: string
  originalId: string
  name: string
  license: string
  licenseUrl: string | null
  author: string | null
  authorUrl: string | null
  sourceUrl: string
  repoKey: string | null
}

export interface RuntimePictogram {
  id: string
  label: string
  vocalization: string
  image: string
  backgroundColor: string
  source: RuntimePictogramSource
}

export interface PictogramSearchResult {
  token: string
  pictogram: RuntimePictogram
}

export interface PictogramPortResult<T> {
  ok: boolean
  message: string
  value?: T
}

export interface PictogramSearchPort {
  readonly configured: boolean
  search(tokens: string[]): Promise<PictogramPortResult<PictogramSearchResult[]>>
  cache(pictogram: RuntimePictogram): Promise<PictogramPortResult<RuntimePictogram>>
}

interface RequestResult {
  statusCode: number
  data: unknown
}

interface DownloadResult {
  statusCode: number
  tempFilePath: string
}

interface SaveResult {
  savedFilePath: string
}

interface PictogramSearchDependencies {
  apiBaseUrl: string
  request: (options: {
    url: string
    method: 'POST'
    data: { tokens: string[] }
    header: Record<string, string>
  }) => Promise<RequestResult>
  downloadFile: (options: { url: string }) => Promise<DownloadResult>
  saveFile: (options: { tempFilePath: string }) => Promise<SaveResult>
}

const MAX_SEARCH_TOKENS = 12
const MAX_TOKEN_LENGTH = 24

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeTokens(tokens: string[]) {
  const seen = new Set<string>()

  return (Array.isArray(tokens) ? tokens : [])
    .map(token => String(token || '').trim())
    .filter(token => {
      if (!token || token.length > MAX_TOKEN_LENGTH || seen.has(token)) {
        return false
      }
      seen.add(token)
      return true
    })
    .slice(0, MAX_SEARCH_TOKENS)
}

function getApiOrigin(baseUrl: string) {
  const match = baseUrl.match(/^(https?:\/\/[^/]+)/i)
  return match ? match[1] : ''
}

function resolveTrustedImageUrl(baseUrl: string, imageUrl: unknown) {
  const value = String(imageUrl || '').trim()
  const origin = getApiOrigin(baseUrl)
  if (!origin || !value) return ''

  if (value.startsWith('/')) {
    return origin + value
  }

  return value === origin || value.startsWith(origin + '/') ? value : ''
}

function normalizePictogram(baseUrl: string, value: unknown): RuntimePictogram | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const image = resolveTrustedImageUrl(baseUrl, raw.image || raw.imageUrl)

  if (!image) return null

  return normalizeCoreRuntimePictogram({
    ...raw,
    image
  }) as RuntimePictogram | null
}

export function createPictogramSearchPort(
  dependencies: PictogramSearchDependencies
): PictogramSearchPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = Boolean(getApiOrigin(apiBaseUrl))

  return {
    configured,

    async search(tokens) {
      const queryTokens = normalizeTokens(tokens)
      if (!configured) {
        return { ok: false, message: '在线补图尚未配置，请先部署 cboard-api。' }
      }
      if (!queryTokens.length) {
        return { ok: true, message: '没有需要搜索的缺词。', value: [] }
      }

      try {
        const response = await dependencies.request({
          url: apiBaseUrl + '/pictograms/search',
          method: 'POST',
          data: { tokens: queryTokens },
          header: { 'Content-Type': 'application/json' }
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return { ok: false, message: '在线补图服务暂时不可用。' }
        }

        const payload = response.data as { results?: unknown[] } | null
        const payloadResults =
          payload && Array.isArray(payload.results) ? payload.results : []
        const results = payloadResults
          .map(item => {
            if (!item || typeof item !== 'object') return null
            const raw = item as Record<string, unknown>
            const token = String(raw.token || '').trim()
            const pictogram = normalizePictogram(apiBaseUrl, raw.pictogram)
            return token && pictogram ? { token, pictogram } : null
          })
          .filter((item): item is PictogramSearchResult => Boolean(item))

        return {
          ok: true,
          message: results.length ? '已找到候选图，请照护者确认。' : '暂时没有找到合适图片。',
          value: results
        }
      } catch (error) {
        return { ok: false, message: '网络不可用，已保留离线沟通功能。' }
      }
    },

    async cache(pictogram) {
      const normalized = normalizePictogram(apiBaseUrl, pictogram)
      if (!configured || !normalized) {
        return { ok: false, message: '候选图片来源无效，未保存。' }
      }

      try {
        const downloaded = await dependencies.downloadFile({
          url: normalized.image
        })
        if (
          downloaded.statusCode < 200 ||
          downloaded.statusCode >= 300 ||
          !downloaded.tempFilePath
        ) {
          return { ok: false, message: '候选图片下载失败，请稍后重试。' }
        }

        const saved = await dependencies.saveFile({
          tempFilePath: downloaded.tempFilePath
        })
        if (!saved.savedFilePath) {
          return { ok: false, message: '候选图片无法保存到本机。' }
        }

        return {
          ok: true,
          message: '图片已确认并保存到本机。',
          value: { ...normalized, image: saved.savedFilePath }
        }
      } catch (error) {
        return { ok: false, message: '图片缓存失败，离线沟通不受影响。' }
      }
    }
  }
}
