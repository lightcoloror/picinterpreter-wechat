import { getCommunicationEnhancementLimitMessage } from '../../platform/communicationEnhancementError'

export interface BackgroundRemovalResult {
  ok: boolean
  message: string
  image?: string
  provider?: string
}

interface BackgroundRemovalPortDependencies {
  apiBaseUrl: string
  getAuthToken: () => string
  compressImage: (filePath: string) => Promise<{ tempFilePath: string }>
  getFileSize: (filePath: string) => Promise<number>
  uploadFile: (options: {
    url: string
    filePath: string
    name: 'image'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
  saveBase64Png: (imageBase64: string) => Promise<string>
}

const maximumInputBytes = 2 * 1024 * 1024
const maximumOutputBase64Length = 5_592_408
const maximumDimension = 8192
const maximumPixels = 32 * 1024 * 1024

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function parseResponseData(value: unknown): Record<string, unknown> | null {
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

function isValidBase64Png(value: string) {
  return (
    value.length > 0 &&
    value.length <= maximumOutputBase64Length &&
    value.startsWith('iVBORw0KGgo') &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  )
}

function isValidDimension(value: unknown) {
  return (
    Number.isInteger(value) &&
    Number(value) > 0 &&
    Number(value) <= maximumDimension
  )
}

function errorMessage(statusCode: number, responseData: unknown) {
  const limitMessage = getCommunicationEnhancementLimitMessage(
    statusCode,
    responseData,
    '原图仍保留，可继续直接使用。'
  )
  if (limitMessage) return limitMessage
  if (statusCode === 401 || statusCode === 403) {
    return '登录已失效，原图仍保留，可继续直接使用。'
  }
  if (statusCode === 413) {
    return '图片压缩后仍过大，原图仍保留，请换一张图片。'
  }
  if (statusCode === 503) {
    return '去背景服务尚未配置，原图仍保留，可继续直接使用。'
  }
  return '去背景暂时不可用，原图仍保留，可继续直接使用。'
}

export function createBackgroundRemovalPort(
  dependencies: BackgroundRemovalPortDependencies
) {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = /^https?:\/\/[^/]+/i.test(apiBaseUrl)

  return {
    configured,

    async removeBackground(
      sourceFilePath: string
    ): Promise<BackgroundRemovalResult> {
      if (!configured) {
        return {
          ok: false,
          message: '去背景服务尚未配置，原图仍保留，可继续直接使用。'
        }
      }
      const token = String(dependencies.getAuthToken() || '').trim()
      if (!token) {
        return {
          ok: false,
          message: '登录后可使用一键去背景，原图仍保留。'
        }
      }

      try {
        let filePath = String(sourceFilePath || '').trim()
        if (!filePath) {
          return { ok: false, message: '没有读取到有效图片。' }
        }
        let fileSize = await dependencies.getFileSize(filePath)
        if (fileSize > maximumInputBytes) {
          const compressed = await dependencies.compressImage(filePath)
          filePath = String(compressed.tempFilePath || '').trim()
          fileSize = filePath
            ? await dependencies.getFileSize(filePath)
            : 0
        }
        if (!filePath || fileSize <= 0 || fileSize > maximumInputBytes) {
          return {
            ok: false,
            message: '图片压缩后仍超过 2 MiB，原图仍保留，请换一张图片。'
          }
        }

        const response = await dependencies.uploadFile({
          url: `${apiBaseUrl}/gpt/communication/background-removal`,
          filePath,
          name: 'image',
          header: { Authorization: `Bearer ${token}` }
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return {
            ok: false,
            message: errorMessage(response.statusCode, response.data)
          }
        }

        const value = parseResponseData(response.data)
        const imageBase64 = String(
          (value && value.imageBase64) || ''
        ).trim()
        const provider = String(
          (value && value.provider) || ''
        ).trim()
        const width = value && value.width
        const height = value && value.height
        const validResponse = Boolean(
          value &&
          value.mimeType === 'image/png' &&
          value.sourceStored === false &&
          value.originalRetained === true &&
          provider &&
          isValidBase64Png(imageBase64) &&
          isValidDimension(width) &&
          isValidDimension(height) &&
          Number(width) * Number(height) <= maximumPixels
        )
        if (!validResponse) {
          return {
            ok: false,
            message:
              '没有得到可确认隐私与透明背景的可靠结果，原图仍保留。'
          }
        }

        const image = String(
          await dependencies.saveBase64Png(imageBase64)
        ).trim()
        if (!image) {
          return {
            ok: false,
            message: '透明图片无法保存到本机，原图仍保留。'
          }
        }
        return {
          ok: true,
          message: '透明背景已应用；保存前可一键恢复原图。',
          image,
          provider
        }
      } catch (error) {
        return {
          ok: false,
          message: '去背景暂时不可用，原图仍保留，可继续直接使用。'
        }
      }
    }
  }
}
