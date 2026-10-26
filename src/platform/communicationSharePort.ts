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
  shareExpressionText(sentence: string, options?: {
    isCurrent?: () => boolean
  }): Promise<CommunicationShareResult>
  shareReceiverImage(
    items: CommunicationOutputItem[],
    options?: { speechText?: string; isCurrent?: () => boolean }
  ): Promise<CommunicationShareResult>
}

interface CommunicationShareDependencies {
  copyText(text: string): Promise<void>
  renderReceiverImage(document: ReceiverShareDocument, options: {
    isCurrent: () => boolean
  }): Promise<{
    path: string
    failedImageCount: number
  }>
  shareImage(path: string): Promise<void>
  discardReceiverImage?(path: string): Promise<void>
  renderTimeoutMs?: number
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
  // A native clipboard write cannot be revoked. Keep its slot until it settles,
  // even if the originating page has gone away; never queue or retry stale text.
  let copyPending = false
  return {
    async shareExpressionText(sentence, options = {}) {
      const isCurrent = () => !options.isCurrent || options.isCurrent()
      const cancelled = (): CommunicationShareResult => ({
        ok: false, cancelled: true, message: '旧复制结果已失效，请重新确认要分享的句子。'
      })
      if (!isCurrent()) return cancelled()
      const payload = buildExpressionSharePayload(sentence)
      if (!payload) {
        return { ok: false, message: '请先选择一句话再分享。' }
      }
      if (copyPending) {
        return { ok: false, message: '上一次复制尚未完成，请稍后再试；当前表达仍会保留。' }
      }

      copyPending = true
      try {
        await dependencies.copyText(payload.text)
        if (!isCurrent()) return cancelled()
        return {
          ok: true,
          message: '句子已复制，可粘贴到微信或其他应用发送。'
        }
      } catch (error) {
        if (!isCurrent()) return cancelled()
        return {
          ok: false,
          message: '句子复制失败，当前表达仍会保留。'
        }
      } finally {
        copyPending = false
      }
    },

    async shareReceiverImage(items, options = {}) {
      // Reuse the request-validity guard used by speech and expression playback.
      // Rendering may outlive the page or its timeout; it must not open a menu.
      let abandoned = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let discardedPath = ''
      const isCurrent = () => !abandoned && (!options.isCurrent || options.isCurrent())
      const cancelled = (): CommunicationShareResult => ({
        ok: false, cancelled: true, message: '已取消分享。'
      })
      const timeoutError = new Error('Receiver image rendering timed out')
      const discard = (path: string) => {
        if (!path || discardedPath === path || !dependencies.discardReceiverImage) return
        discardedPath = path
        try {
          // Only the generated export is discarded, never any input photograph.
          void dependencies.discardReceiverImage(path).catch(() => {})
        } catch (_) { /* Best-effort cleanup cannot keep the page waiting. */ }
      }
      try {
        if (!isCurrent()) return cancelled()
        const document = buildReceiverShareDocument(items, options)
        if (!document) {
          return { ok: false, message: '请先生成图片序列再分享。' }
        }

        const rendering = Promise.resolve().then(() => {
          if (!isCurrent()) throw new Error('cancelled')
          return dependencies.renderReceiverImage(document, { isCurrent })
        }).then(rendered => {
          if (!isCurrent()) discard(rendered.path)
          return rendered
        })
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abandoned = true
            reject(timeoutError)
          }, dependencies.renderTimeoutMs ?? 30000)
        })
        const rendered = await Promise.race([rendering, timeout])
        clearTimeout(timer)
        timer = undefined
        if (!isCurrent()) {
          discard(rendered.path)
          return cancelled()
        }
        await dependencies.shareImage(rendered.path)
        if (!isCurrent()) return cancelled()
        return {
          ok: true,
          value: rendered.path,
          message: rendered.failedImageCount
            ? `分享菜单已打开；${rendered.failedImageCount} 张图片加载失败，已用问号标记。`
            : '图片分享菜单已打开。'
        }
      } catch (error) {
        if (options.isCurrent && !options.isCurrent()) return cancelled()
        if (error === timeoutError) {
          return { ok: false, message: '图片生成超时，当前沟通内容仍会保留，请重试。' }
        }
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
      } finally {
        abandoned = true
        if (timer !== undefined) clearTimeout(timer)
      }
    }
  }
}
