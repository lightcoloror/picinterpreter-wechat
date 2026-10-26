import Taro from '@tarojs/taro'
import {
  buildReceiverShareLayout,
  renderReceiverShareLayout,
  type ReceiverShareDocument
} from '@cboard-communication-core/communicationShare'

import { createCommunicationSharePort } from './communicationSharePort'

type ShareCanvas = ReturnType<typeof Taro.createOffscreenCanvas>
type ShareCanvasContext = Parameters<
  typeof renderReceiverShareLayout
>[0]
type CanvasExportOptions = Parameters<
  typeof Taro.canvasToTempFilePath
>[0]

function loadCanvasImage(canvas: ShareCanvas, source: string, isCurrent: () => boolean) {
  if (!isCurrent()) return Promise.reject(new Error('cancelled'))
  return new Promise<unknown>((resolve, reject) => {
    const image = canvas.createImage()
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = () => {}
      image.onerror = () => {}
      if (error || !isCurrent()) reject(error || new Error('cancelled'))
      else resolve(image)
    }
    const timer = setTimeout(() => finish(new Error('Image load timed out')), 10000)
    image.onload = () => finish()
    image.onerror = error => finish(error || new Error('Image load failed'))
    try {
      image.src = source
    } catch (error) {
      finish(error)
    }
  })
}

async function renderReceiverImage(
  document: ReceiverShareDocument,
  { isCurrent }: { isCurrent: () => boolean }
) {
  if (!isCurrent()) throw new Error('cancelled')
  const layout = buildReceiverShareLayout(document)
  if (!layout) throw new TypeError('Receiver share layout is empty')

  const canvas = Taro.createOffscreenCanvas({
    type: '2d',
    width: layout.width,
    height: layout.height
  })
  const context = canvas.getContext('2d') as unknown as ShareCanvasContext
  const rendered = await renderReceiverShareLayout(
    context,
    layout,
    source => loadCanvasImage(canvas, source, isCurrent)
  )
  if (!isCurrent()) throw new Error('cancelled')
  const exported = await Taro.canvasToTempFilePath({
    canvas: canvas as unknown as CanvasExportOptions['canvas'],
    fileType: 'png',
    width: layout.width,
    height: layout.height,
    destWidth: layout.width,
    destHeight: layout.height
  })
  if (!exported.tempFilePath) {
    throw new TypeError('Receiver share image export failed')
  }

  return {
    path: exported.tempFilePath,
    failedImageCount: rendered.failedImageCount
  }
}

export const taroCommunicationSharePort =
  createCommunicationSharePort({
    copyText: async text => {
      await Taro.setClipboardData({ data: text })
    },
    renderReceiverImage,
    shareImage: async path => {
      await Taro.showShareImageMenu({ path })
    },
    discardReceiverImage: path => new Promise(resolve => {
      Taro.getFileSystemManager().unlink({
        filePath: path,
        success: () => resolve(),
        fail: () => resolve()
      })
    })
  })
