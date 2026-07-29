import {
  normalizePictogramMetadataSuggestion,
  type PictogramMetadataSuggestion
} from '@cboard-communication-core/pictogramMetadataSuggestion'
import { getCommunicationEnhancementLimitMessage } from '../../platform/communicationEnhancementError'

export interface PictogramMetadataSuggestionResult {
  ok: boolean
  message: string
  value?: PictogramMetadataSuggestion
}

interface PictogramMetadataSuggestionPortDependencies {
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
}

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

function errorMessage(statusCode: number, responseData: unknown) {
  const limitMessage = getCommunicationEnhancementLimitMessage(
    statusCode,
    responseData,
    '照片仍保留，可继续手工填写。'
  )
  if (limitMessage) return limitMessage
  if (statusCode === 401 || statusCode === 403) {
    return '登录已失效，照片仍保留，可继续手工填写。'
  }
  if (statusCode === 503) {
    return '视觉建议服务尚未配置，照片仍保留，可继续手工填写。'
  }
  return '视觉建议暂时不可用，照片仍保留，可继续手工填写。'
}

export function createPictogramMetadataSuggestionPort(
  dependencies: PictogramMetadataSuggestionPortDependencies
) {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = /^https?:\/\/[^/]+/i.test(apiBaseUrl)

  return {
    configured,

    async suggest(
      sourceFilePath: string
    ): Promise<PictogramMetadataSuggestionResult> {
      if (!configured) {
        return {
          ok: false,
          message: '视觉建议服务尚未配置，照片仍保留，可继续手工填写。'
        }
      }
      const token = String(dependencies.getAuthToken() || '').trim()
      if (!token) {
        return {
          ok: false,
          message: '登录后可生成视觉建议，照片仍保留，可继续手工填写。'
        }
      }

      try {
        let filePath = String(sourceFilePath || '').trim()
        if (!filePath) {
          return { ok: false, message: '没有读取到有效图片。' }
        }
        let fileSize = await dependencies.getFileSize(filePath)
        if (fileSize > 2 * 1024 * 1024) {
          const compressed = await dependencies.compressImage(filePath)
          filePath = String(compressed.tempFilePath || '').trim()
          fileSize = filePath
            ? await dependencies.getFileSize(filePath)
            : 0
        }
        if (!filePath || fileSize <= 0 || fileSize > 2 * 1024 * 1024) {
          return {
            ok: false,
            message: '图片压缩后仍超过 2 MiB，请换一张图片后重试。'
          }
        }

        const response = await dependencies.uploadFile({
          url: `${apiBaseUrl}/gpt/communication/pictogram-metadata`,
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
        const suggestion = normalizePictogramMetadataSuggestion(
          parseResponseData(response.data)
        )
        if (!suggestion || suggestion.sourceStored) {
          return {
            ok: false,
            message:
              '没有得到可确认“不保存原图”的可靠建议，照片仍保留，请手工填写。'
          }
        }
        return {
          ok: true,
          message: '建议已填入空白字段，请检查并修改后再保存。',
          value: suggestion
        }
      } catch (error) {
        return {
          ok: false,
          message: '视觉建议暂时不可用，照片仍保留，可继续手工填写。'
        }
      }
    }
  }
}
