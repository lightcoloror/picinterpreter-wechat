import {
  normalizeImageTextRecognitionResponse,
  validateImageTextRecognitionFile
} from '@cboard-communication-core/imageTextRecognition'
import { getCommunicationEnhancementLimitMessage } from '../../platform/communicationEnhancementError'

export interface ImageTextRecognitionValue {
  text: string
  provider: string
  sourceStored: boolean
}

export interface ImageTextRecognitionResult {
  ok: boolean
  message: string
  value?: ImageTextRecognitionValue
}

interface SelectedImage {
  tempFilePath: string
  size?: number
}

interface ImageTextRecognitionPortDependencies {
  apiBaseUrl: string
  getAuthToken: () => string
  chooseImage: () => Promise<SelectedImage | null>
  compressImage: (filePath: string) => Promise<{ tempFilePath: string }>
  getFileSize: (filePath: string) => Promise<number>
  uploadFile: (options: {
    url: string
    filePath: string
    name: 'image'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function hasHttpOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function isCancelError(error: unknown) {
  return String(
    error && typeof error === 'object' && 'errMsg' in error
      ? (error as { errMsg?: unknown }).errMsg
      : error || ''
  )
    .toLocaleLowerCase()
    .includes('cancel')
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

function inferImageMimeType(filePath: string) {
  const normalized = String(filePath || '').toLocaleLowerCase()
  if (/\.png(?:$|\?)/.test(normalized)) return 'image/png'
  if (/\.webp(?:$|\?)/.test(normalized)) return 'image/webp'
  return 'image/jpeg'
}

function getErrorMessage(statusCode: number, responseData: unknown) {
  const limitMessage = getCommunicationEnhancementLimitMessage(
    statusCode,
    responseData,
    '请继续手工输入，或稍后重试图片识字。'
  )
  if (limitMessage) return limitMessage
  if (statusCode === 401 || statusCode === 403) {
    return '登录已失效，请重新登录后使用图片识字。'
  }
  if (statusCode === 503) {
    return '服务端尚未配置图片识字，请继续手工输入。'
  }
  return '图片识字服务暂时不可用，请继续手工输入。'
}

export function createImageTextRecognitionPort(
  dependencies: ImageTextRecognitionPortDependencies
) {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = hasHttpOrigin(apiBaseUrl)

  return {
    configured,

    async selectAndRecognize(): Promise<ImageTextRecognitionResult> {
      if (!configured) {
        return {
          ok: false,
          message: '图片识字服务尚未配置，请继续手工输入。'
        }
      }
      const token = String(dependencies.getAuthToken() || '').trim()
      if (!token) {
        return {
          ok: false,
          message: '登录后可使用图片识字，当前仍可手工输入。'
        }
      }

      try {
        const selected = await dependencies.chooseImage()
        if (!selected) {
          return { ok: false, message: '已取消选择图片。' }
        }

        let filePath = String(selected.tempFilePath || '').trim()
        if (!filePath) {
          return { ok: false, message: '没有读取到有效图片。' }
        }
        let fileSize = Number(selected.size)
        if (!Number.isFinite(fileSize) || fileSize <= 0) {
          fileSize = await dependencies.getFileSize(filePath)
        }

        if (fileSize > 2 * 1024 * 1024) {
          const compressed = await dependencies.compressImage(filePath)
          filePath = String(compressed.tempFilePath || '').trim()
          fileSize = filePath
            ? await dependencies.getFileSize(filePath)
            : 0
        }

        const validation = validateImageTextRecognitionFile({
          type: inferImageMimeType(filePath),
          size: fileSize
        })
        if (!validation.valid) {
          return { ok: false, message: validation.message }
        }

        const response = await dependencies.uploadFile({
          url: apiBaseUrl + '/gpt/communication/ocr',
          filePath,
          name: 'image',
          header: { Authorization: `Bearer ${token}` }
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return {
            ok: false,
            message: getErrorMessage(response.statusCode, response.data)
          }
        }

        const payload = parseResponseData(response.data)
        const value = normalizeImageTextRecognitionResponse(payload || {})
        if (!value.text) {
          return {
            ok: false,
            message: '没有识别到文字，请换一张更清晰的图片。'
          }
        }

        return {
          ok: true,
          message: '识别完成，文字仍可人工修改。',
          value
        }
      } catch (error) {
        return {
          ok: false,
          message: isCancelError(error)
            ? '已取消选择图片。'
            : '图片选择、压缩或上传失败，请稍后重试。'
        }
      }
    }
  }
}
