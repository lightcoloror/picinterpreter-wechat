import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { taroCommunicationSharePort } from './taroCommunicationSharePort'

const fixtures = vi.hoisted(() => ({
  canvas: vi.fn(), export: vi.fn(), share: vi.fn(), unlink: vi.fn(), request: vi.fn(), clipboard: vi.fn()
}))
vi.mock('@tarojs/taro', () => ({ default: {
  createOffscreenCanvas: fixtures.canvas,
  canvasToTempFilePath: fixtures.export,
  showShareImageMenu: fixtures.share,
  setClipboardData: fixtures.clipboard,
  getFileSystemManager: () => ({ unlink: fixtures.unlink }),
  request: fixtures.request
} }))

const items = [
  { id: 'synthetic-person', label: '合成人甲', image: 'wxfile://synthetic-private/person.png' },
  { id: 'water', label: '水', image: 'wxfile://synthetic-local/water.png' }
]
const generatedPath = 'wxfile://synthetic-export/sequence.png'
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve() }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
const context = { fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() }
let autoLoad = true
let throwSource = false
let images: Array<{ onload: () => void; onerror: (error: unknown) => void; width: number; height: number; src: string }> = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  autoLoad = true
  throwSource = false
  images = []
  fixtures.canvas.mockImplementation(() => ({
    getContext: () => context,
    createImage: () => {
      const image = { onload: () => {}, onerror: (_: unknown) => {}, width: 100, height: 100, src: '' }
      let source = ''
      Object.defineProperty(image, 'src', {
        get: () => source,
        set: (value: string) => {
          source = value
          if (throwSource) throw new Error('synthetic image source unavailable')
          if (autoLoad) void Promise.resolve().then(() => image.onload())
        }
      })
      images.push(image)
      return image
    }
  }))
  fixtures.export.mockResolvedValue({ tempFilePath: generatedPath })
  fixtures.share.mockResolvedValue(undefined)
  fixtures.clipboard.mockResolvedValue(undefined)
  fixtures.unlink.mockImplementation(options => options.success())
  fixtures.request.mockImplementation(() => { throw new Error('No network is authorized in this synthetic test') })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('actual Taro expression clipboard wiring', () => {
  test('copies only the selected sentence, preserving full name and negation, with no media or network', async () => {
    await expect(taroCommunicationSharePort.shareExpressionText('合成人甲今晚不回家吃饭'))
      .resolves.toMatchObject({ ok: true, message: expect.stringContaining('已复制') })
    expect(fixtures.clipboard).toHaveBeenCalledExactlyOnceWith({ data: '合成人甲今晚不回家吃饭' })
    for (const fn of [fixtures.canvas, fixtures.export, fixtures.share, fixtures.request, fixtures.unlink])
      expect(fn).not.toHaveBeenCalled()
  })

  test('a hidden-page native copy settles without success feedback or another write; manual retry remains possible', async () => {
    const pending = deferred<void>()
    let current = true
    fixtures.clipboard.mockReturnValueOnce(pending.promise)
    const task = taroCommunicationSharePort.shareExpressionText('旧句', { isCurrent: () => current })
    current = false
    await expect(taroCommunicationSharePort.shareExpressionText('新句')).resolves.toMatchObject({ ok: false })
    expect(fixtures.clipboard).toHaveBeenCalledTimes(1)
    pending.resolve()
    await expect(task).resolves.toMatchObject({ cancelled: true })
    await expect(taroCommunicationSharePort.shareExpressionText('新句')).resolves.toMatchObject({ ok: true })
    expect(fixtures.clipboard.mock.calls.map(call => call[0].data)).toEqual(['旧句', '新句'])
  })

  test('native clipboard rejection preserves the expression and permits an explicit retry', async () => {
    fixtures.clipboard.mockRejectedValueOnce(new Error('synthetic native clipboard unavailable'))
    await expect(taroCommunicationSharePort.shareExpressionText('合成人甲不喝水'))
      .resolves.toMatchObject({ ok: false, message: expect.stringContaining('仍会保留') })
    await expect(taroCommunicationSharePort.shareExpressionText('合成人甲不喝水')).resolves.toMatchObject({ ok: true })
    expect(fixtures.clipboard).toHaveBeenCalledTimes(2)
    expect(fixtures.request).not.toHaveBeenCalled()
  })
})

describe('actual Taro receiver image export wiring', () => {
  test('confirmed synthetic private images remain local, ordered and unchanged in the export', async () => {
    const before = JSON.stringify(items)
    await expect(taroCommunicationSharePort.shareReceiverImage(items, { speechText: '合成人甲不喝水' })).resolves.toMatchObject({ ok: true })
    expect(images.map(image => image.src)).toEqual(items.map(item => item.image))
    expect(context.fillText.mock.calls.some(call => String(call[0]).includes('合成人甲不喝水'))).toBe(true)
    expect(fixtures.share).toHaveBeenCalledExactlyOnceWith({ path: generatedPath })
    expect(fixtures.request).not.toHaveBeenCalled()
    expect(fixtures.unlink).not.toHaveBeenCalled()
    expect(JSON.stringify(items)).toBe(before)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaving while an image loads does not load later images or export the canvas', async () => {
    autoLoad = false
    let current = true
    const task = taroCommunicationSharePort.shareReceiverImage(items, { isCurrent: () => current })
    await flush()
    current = false
    images[0].onload()
    await expect(task).resolves.toMatchObject({ cancelled: true })
    expect(images).toHaveLength(1)
    expect(fixtures.export).not.toHaveBeenCalled()
    expect(fixtures.share).not.toHaveBeenCalled()
    expect(fixtures.unlink).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('leaving during native export discards only its late generated path', async () => {
    let current = true
    const pending = deferred<{ tempFilePath: string }>()
    fixtures.export.mockReturnValueOnce(pending.promise)
    fixtures.unlink.mockImplementation(() => {})
    const task = taroCommunicationSharePort.shareReceiverImage(items, { isCurrent: () => current })
    await flush()
    current = false
    pending.resolve({ tempFilePath: generatedPath })
    await expect(task).resolves.toMatchObject({ cancelled: true })
    expect(fixtures.share).not.toHaveBeenCalled()
    expect(fixtures.unlink).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ filePath: generatedPath }))
    expect(fixtures.unlink.mock.calls.some(call => items.some(item => item.image === call[0].filePath))).toBe(false)
  })

  test('native export timeout permits retry, and its late file never opens a second menu', async () => {
    const pending = deferred<{ tempFilePath: string }>()
    fixtures.export.mockReturnValueOnce(pending.promise)
    const first = taroCommunicationSharePort.shareReceiverImage(items)
    await flush()
    vi.advanceTimersByTime(30000)
    await expect(first).resolves.toMatchObject({ ok: false, message: expect.stringContaining('超时') })
    await expect(taroCommunicationSharePort.shareReceiverImage(items)).resolves.toMatchObject({ ok: true })
    pending.resolve({ tempFilePath: 'wxfile://synthetic-export/old.png' })
    await flush()
    expect(fixtures.share).toHaveBeenCalledTimes(1)
    expect(fixtures.unlink).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ filePath: 'wxfile://synthetic-export/old.png' }))
    expect(vi.getTimerCount()).toBe(0)
  })

  test('an image with no callback becomes the existing explicit placeholder, and late load does not redraw', async () => {
    autoLoad = false
    const task = taroCommunicationSharePort.shareReceiverImage(items)
    await flush()
    const lateLoad = images[0].onload
    autoLoad = true
    vi.advanceTimersByTime(10000)
    await expect(task).resolves.toMatchObject({ ok: true, message: expect.stringContaining('1 张图片加载失败') })
    const draws = context.drawImage.mock.calls.length
    lateLoad(); await flush()
    expect(context.drawImage).toHaveBeenCalledTimes(draws)
    expect(fixtures.share).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('synchronous image-source errors release timers and retain the existing placeholder explanation', async () => {
    throwSource = true
    await expect(taroCommunicationSharePort.shareReceiverImage(items)).resolves.toMatchObject({
      ok: true, message: expect.stringContaining('2 张图片加载失败')
    })
    expect(fixtures.share).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
