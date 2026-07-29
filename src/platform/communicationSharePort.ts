import type { CommunicationOutputItem } from '@cboard-communication-core/symbolMatching'
import {
  buildExpressionSharePayload,
  buildReceiverShareDocument,
  type ReceiverShareDocument
} from '@cboard-communication-core/communicationShare'

export interface CommunicationShareResult {
  ok: boolean
  message: string
  value?: string
  cancelled?: boolean
}

export interface CommunicationSharePort {
  shareExpressionText(sentence: string): Promise<CommunicationShareResult>
  shareReceiverImage(
    items: CommunicationOutputItem[],
    options?: { speechText?: string }
  ): Promise<CommunicationShareResult>
}

interface CommunicationShareDependencies {
  copyText(text: string): Promise<void>
  renderReceiverImage(document: ReceiverShareDocument): Promise<{
    path: string
    failedImageCount: number
  }>
  shareImage(path: string): Promise<void>
}

function isCancellation(error: unknown) {
  const value = String(
    error && typeof error === 'object' && 'errMsg' in error
      ? (error as { errMsg?: unknown }).errMsg
      : error
  ).toLocaleLowerCase()
  return value.includes('cancel')
}

export function createCommunicationSharePort(
  dependencies: CommunicationShareDependencies
): CommunicationSharePort {
  return {
    async shareExpressionText(sentence) {
      const payload = buildExpressionSharePayload(sentence)
      if (!payload) {
        return { ok: false, message: '请先选择一句话再分享。' }
      }

      try {
        await dependencies.copyText(payload.text)
        return {
          ok: true,
          message: '句子已复制，可粘贴到微信或其他应用发送。'
        }
      } catch (error) {
        return {
          ok: false,
          message: '句子复制失败，当前表达仍会保留。'
        }
      }
    },

    async shareReceiverImage(items, options = {}) {
      try {
        const document = buildReceiverShareDocument(items, options)
        if (!document) {
          return { ok: false, message: '请先生成图片序列再分享。' }
        }

        const rendered = await dependencies.renderReceiverImage(document)
        await dependencies.shareImage(rendered.path)
        return {
          ok: true,
          value: rendered.path,
          message: rendered.failedImageCount
            ? `分享菜单已打开；${rendered.failedImageCount} 张图片加载失败，已用问号标记。`
            : '图片分享菜单已打开。'
        }
      } catch (error) {
        if (isCancellation(error)) {
          return {
            ok: false,
            cancelled: true,
            message: '已取消分享。'
          }
        }
        return {
          ok: false,
          message:
            error instanceof RangeError
              ? '图片数量过多，请缩短本次内容后再分享。'
              : '图片序列生成失败，当前沟通内容仍会保留。'
        }
      }
    }
  }
}
