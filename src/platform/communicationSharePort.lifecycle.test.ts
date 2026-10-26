import { afterEach, describe, expect, test, vi } from 'vitest'
import { createCommunicationSharePort } from './communicationSharePort'

const items = [
  { id: 'synthetic-person', label: '合成人甲', image: 'wxfile://synthetic-private/person.png' },
  { id: 'water', label: '水', image: 'wxfile://synthetic-local/water.png' }
]
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const imageResult = (path = 'wxfile://synthetic-export/share.png') => ({ path, failedImageCount: 0 })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function fixture() {
  const dependencies = {
    copyText: vi.fn().mockResolvedValue(undefined),
    renderReceiverImage: vi.fn().mockResolvedValue(imageResult()),
    shareImage: vi.fn().mockResolvedValue(undefined),
    discardReceiverImage: vi.fn().mockResolvedValue(undefined),
    renderTimeoutMs: 30000
  }
  return { dependencies, port: createCommunicationSharePort(dependencies) }
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('expression clipboard cancellation and recovery', () => {
  test('an obsolete callback never writes to the clipboard', async () => {
    const f = fixture()
    await expect(f.port.shareExpressionText('合成人甲不喝水', { isCurrent: () => false }))
      .resolves.toMatchObject({ ok: false, cancelled: true })
    expect(f.dependencies.copyText).not.toHaveBeenCalled()
  })

  test.each(['resolve', 'reject'] as const)('late native %s after leaving is not reported as current', async outcome => {
    const f = fixture(), pending = deferred<void>()
    let current = true
    f.dependencies.copyText.mockReturnValueOnce(pending.promise)
    const task = f.port.shareExpressionText('合成人甲不喝水', { isCurrent: () => current })
    current = false
    if (outcome === 'resolve') pending.resolve()
    else pending.reject(new Error('synthetic clipboard failure'))
    await expect(task).resolves.toMatchObject({ ok: false, cancelled: true })
    expect(f.dependencies.copyText).toHaveBeenCalledExactlyOnceWith('合成人甲不喝水')
    expect(f.dependencies.renderReceiverImage).not.toHaveBeenCalled()
  })

  test('pending native writes serialize double clicks and a reopened page, without automatic retry', async () => {
    vi.useFakeTimers()
    const f = fixture(), pending = deferred<void>()
    let current = true
    f.dependencies.copyText.mockReturnValueOnce(pending.promise)
    const first = f.port.shareExpressionText('旧句', { isCurrent: () => current })
    await expect(f.port.shareExpressionText('旧句')).resolves.toMatchObject({ ok: false })
    current = false
    vi.advanceTimersByTime(60000)
    await expect(f.port.shareExpressionText('新句')).resolves.toMatchObject({
      ok: false, message: expect.stringContaining('尚未完成')
    })
    expect(f.dependencies.copyText).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    pending.resolve()
    await expect(first).resolves.toMatchObject({ cancelled: true })
    await expect(f.port.shareExpressionText('新句')).resolves.toMatchObject({ ok: true })
    expect(f.dependencies.copyText.mock.calls.map(call => call[0])).toEqual(['旧句', '新句'])
  })

  test.each(['throw', 'reject'] as const)('an explicit %s releases the copy slot for a manual retry', async mode => {
    const f = fixture()
    if (mode === 'throw') f.dependencies.copyText.mockImplementationOnce(() => { throw new Error('synthetic') })
    else f.dependencies.copyText.mockRejectedValueOnce(new Error('synthetic'))
    await expect(f.port.shareExpressionText('合成人甲不喝水')).resolves.toMatchObject({ ok: false })
    await expect(f.port.shareExpressionText('合成人甲不喝水')).resolves.toMatchObject({ ok: true })
    expect(f.dependencies.copyText).toHaveBeenCalledTimes(2)
  })
})

describe('receiver share cancellation and recovery', () => {
  test('an obsolete page callback starts no rendering or native share', async () => {
    const f = fixture()
    await expect(f.port.shareReceiverImage(items, { isCurrent: () => false })).resolves.toMatchObject({ cancelled: true })
    expect(f.dependencies.renderReceiverImage).not.toHaveBeenCalled()
    expect(f.dependencies.shareImage).not.toHaveBeenCalled()
  })

  test('leaving during rendering never opens the menu and discards only the generated image', async () => {
    const f = fixture(), rendered = deferred<ReturnType<typeof imageResult>>()
    let current = true
    const snapshot = JSON.stringify(items)
    f.dependencies.renderReceiverImage.mockReturnValueOnce(rendered.promise)
    const task = f.port.shareReceiverImage(items, { speechText: '合成人甲不想喝水', isCurrent: () => current })
    await flush()
    current = false
    rendered.resolve(imageResult())
    await expect(task).resolves.toMatchObject({ cancelled: true })
    expect(f.dependencies.shareImage).not.toHaveBeenCalled()
    expect(f.dependencies.discardReceiverImage).toHaveBeenCalledExactlyOnceWith(imageResult().path)
    expect(JSON.stringify(items)).toBe(snapshot)
  })

  test('a stalled renderer times out and its late completion cannot open the menu', async () => {
    vi.useFakeTimers()
    const f = fixture(), rendered = deferred<ReturnType<typeof imageResult>>()
    f.dependencies.renderReceiverImage.mockReturnValueOnce(rendered.promise)
    let result: unknown
    void f.port.shareReceiverImage(items).then(value => { result = value })
    await flush()
    vi.advanceTimersByTime(30000)
    await flush()
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('超时') })
    rendered.resolve(imageResult())
    await flush()
    expect(f.dependencies.shareImage).not.toHaveBeenCalled()
    expect(f.dependencies.discardReceiverImage).toHaveBeenCalledExactlyOnceWith(imageResult().path)
  })

  test('an explicit retry succeeds while the old timed-out export returns later', async () => {
    vi.useFakeTimers()
    const f = fixture(), old = deferred<ReturnType<typeof imageResult>>()
    f.dependencies.renderReceiverImage.mockReturnValueOnce(old.promise)
    let oldResult: unknown
    void f.port.shareReceiverImage(items).then(value => { oldResult = value })
    await flush()
    vi.advanceTimersByTime(30000)
    await flush()
    expect(oldResult).toMatchObject({ ok: false })
    f.dependencies.renderReceiverImage.mockResolvedValueOnce(imageResult('wxfile://synthetic-export/new.png'))
    await expect(f.port.shareReceiverImage(items)).resolves.toMatchObject({ ok: true })
    old.resolve(imageResult('wxfile://synthetic-export/old.png'))
    await flush()
    expect(f.dependencies.shareImage).toHaveBeenCalledExactlyOnceWith('wxfile://synthetic-export/new.png')
    expect(f.dependencies.discardReceiverImage).toHaveBeenCalledExactlyOnceWith('wxfile://synthetic-export/old.png')
  })

  test('cleanup failure does not turn cancellation into another share attempt', async () => {
    const f = fixture(), rendered = deferred<ReturnType<typeof imageResult>>()
    let current = true
    f.dependencies.renderReceiverImage.mockReturnValueOnce(rendered.promise)
    f.dependencies.discardReceiverImage.mockRejectedValue(new Error('synthetic unlink failure'))
    const task = f.port.shareReceiverImage(items, { isCurrent: () => current })
    await flush(); current = false; rendered.resolve(imageResult())
    await expect(task).resolves.toMatchObject({ cancelled: true })
    await flush()
    expect(f.dependencies.shareImage).not.toHaveBeenCalled()
  })

  test('the render timeout does not interrupt a native menu already opened by the user', async () => {
    vi.useFakeTimers()
    const f = fixture(), menu = deferred<void>()
    f.dependencies.shareImage.mockReturnValueOnce(menu.promise)
    let result: unknown
    const task = f.port.shareReceiverImage(items).then(value => { result = value })
    await flush()
    vi.advanceTimersByTime(60000); await flush()
    expect(result).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
    menu.resolve(); await task
    expect(result).toMatchObject({ ok: true })
    expect(f.dependencies.discardReceiverImage).not.toHaveBeenCalled()
  })

  test('synthetic offline export failure permits explicit retry with unchanged confirmed order and text', async () => {
    const f = fixture()
    f.dependencies.renderReceiverImage.mockRejectedValueOnce(new Error('synthetic offline'))
    await expect(f.port.shareReceiverImage(items)).resolves.toMatchObject({ ok: false })
    await expect(f.port.shareReceiverImage(items, { speechText: '合成人甲不想喝水' })).resolves.toMatchObject({ ok: true })
    expect(f.dependencies.renderReceiverImage.mock.calls[1][0]).toMatchObject({
      speechText: '合成人甲不想喝水', items: items.map(item => ({ ...item }))
    })
    expect(f.dependencies.shareImage).toHaveBeenCalledTimes(1)
  })
})
