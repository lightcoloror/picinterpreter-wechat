export const COMMUNICATION_AAC_IMPORT_MAX_BYTES = 20 * 1024 * 1024

export type CommunicationAacSourceFormat = 'snap' | 'touchchat'

export interface CommunicationAacImportDocument {
  path: string
  board: unknown
}

export interface CommunicationAacImportValue {
  sourceFormat: CommunicationAacSourceFormat
  warnings: string[]
  documents: CommunicationAacImportDocument[]
}

export interface CommunicationAacImportResult {
  ok: boolean
  message: string
  value?: CommunicationAacImportValue
}

export interface CommunicationAacImportPort {
  readonly configured: boolean
  convert(input: {
    name: string
    data: Uint8Array
    locale?: string
  }): Promise<CommunicationAacImportResult>
}

interface CommunicationAacImportDependencies {
  apiBaseUrl: string
  getAuthToken: () => string
  uploadFile: (options: {
    url: string
    fileName: string
    data: Uint8Array
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch (error) {
    return null
  }
}

function sourceFormatForFile(name: string): CommunicationAacSourceFormat | null {
  const match = String(name || '').trim().toLocaleLowerCase().match(/\.([a-z0-9]+)$/)
  const extension = match ? match[1] : ''
  if (extension === 'sps' || extension === 'spb') return 'snap'
  if (extension === 'ce') return 'touchchat'
  return null
}

function normalizeResponse(
  value: unknown,
  expectedFormat: CommunicationAacSourceFormat
): CommunicationAacImportValue | null {
  const response = parseObject(value)
  if (
    !response ||
    response.format !== 'picinterpreter-aac-conversion' ||
    Number(response.contractVersion) !== 1 ||
    response.sourceFormat !== expectedFormat ||
    !Array.isArray(response.documents) ||
    response.documents.length < 1 ||
    response.documents.length > 100
  ) return null

  const documents = response.documents
    .map(document => {
      const documentRecord = parseObject(document)
      const board = documentRecord && parseObject(documentRecord.board)
      const path = String((documentRecord && documentRecord.path) || '').trim()
      return path && path.length <= 300 && board
        ? { path, board }
        : null
    })
  if (documents.some(document => !document)) return null

  return {
    sourceFormat: expectedFormat,
    warnings: Array.isArray(response.warnings)
      ? response.warnings
          .slice(0, 20)
          .map(item => String(item || '').trim().slice(0, 300))
          .filter(Boolean)
      : [],
    documents: documents as CommunicationAacImportDocument[]
  }
}

function requestError(statusCode: number) {
  if (statusCode === 401 || statusCode === 403) {
    return '登录已失效，请重新登录后再导入 Snap 或 TouchChat。'
  }
  if (statusCode === 413) return 'AAC 文件或转换结果超过 20 MiB 限额，未导入。'
  if (statusCode === 422) return 'AAC 文件已识别，但内容无法解析，原图库未改变。'
  if (statusCode === 429) return 'AAC 转换服务正忙或额度已用完，请稍后重试。'
  return 'AAC 转换服务暂时不可用，原图库未改变。'
}

export function createCommunicationAacImportPort(
  dependencies: CommunicationAacImportDependencies
): CommunicationAacImportPort {
  const apiBaseUrl = String(dependencies.apiBaseUrl || '').trim().replace(/\/+$/, '')
  const configured = /^https?:\/\/[^/]+/i.test(apiBaseUrl)

  return {
    configured,

    async convert(input) {
      if (!configured) {
        return {
          ok: false,
          message: '尚未配置 cboard-api 地址，OBF、GRD 和 Gridset 本地导入仍可使用。'
        }
      }
      const token = String(dependencies.getAuthToken() || '').trim()
      if (!token) {
        return { ok: false, message: '请先登录，再导入 Snap 或 TouchChat 文件。' }
      }
      const sourceFormat = sourceFormatForFile(input.name)
      if (!sourceFormat) {
        return { ok: false, message: '请选择 Snap .sps/.spb 或 TouchChat .ce 文件。' }
      }
      if (
        !input.data.byteLength ||
        input.data.byteLength > COMMUNICATION_AAC_IMPORT_MAX_BYTES
      ) {
        return { ok: false, message: 'AAC 文件必须是 20 MiB 以内的非空文件。' }
      }

      try {
        const locale = encodeURIComponent(String(input.locale || 'zh-CN'))
        const response = await dependencies.uploadFile({
          url:
            `${apiBaseUrl}/communication/aac-import/convert` +
            `?format=${sourceFormat}&locale=${locale}`,
          fileName: input.name,
          data: input.data,
          header: { Authorization: `Bearer ${token}` }
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return { ok: false, message: requestError(response.statusCode) }
        }
        const converted = normalizeResponse(response.data, sourceFormat)
        return converted
          ? {
              ok: true,
              message: `已转换 ${converted.documents.length} 个 AAC 沟通板，等待本机合并。`,
              value: converted
            }
          : {
              ok: false,
              message: 'AAC 转换响应格式无效，原图库未改变。'
            }
      } catch (error) {
        return { ok: false, message: '网络不可用，原图库未改变。' }
      }
    }
  }
}
