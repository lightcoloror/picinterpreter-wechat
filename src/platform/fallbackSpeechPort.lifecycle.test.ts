import { describe, expect, test, vi } from 'vitest'
import { createFallbackSpeechPort } from './fallbackSpeechPort'
import type { SpeechPort, SpeechResult } from './speechPort'

const failed: SpeechResult = { ok: false, message: '合成插件失败', reason: 'provider' }
const success: SpeechResult = { ok: true, message: '合成播放完成' }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const portFixture = () => ({ available: true, speak: vi.fn(async () => success), stop: vi.fn() })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

describe('fallback speech cancellation boundaries', () => {
  test('a queued plugin failure after stop cannot call the paid fallback', async () => {
    const primary = portFixture(), fallback = portFixture()
    primary.speak.mockResolvedValue(failed)
    const port = createFallbackSpeechPort(primary, fallback)
    const result = port.speak('合成旧句')
    port.stop()
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'stopped' })
    expect(fallback.speak).not.toHaveBeenCalled()
  })
  test('stop settles even when a provider never sends a callback', async () => {
    const primary = portFixture(), fallback = portFixture()
    primary.speak.mockReturnValue(new Promise(() => {}))
    const port = createFallbackSpeechPort(primary, fallback)
    let value: SpeechResult | undefined
    void port.speak('合成挂起').then(result => { value = result })
    port.stop()
    await flush()
    expect(value).toMatchObject({ ok: false, reason: 'stopped' })
    expect(fallback.speak).not.toHaveBeenCalled()
  })
  test('a new sentence invalidates the old failure and retains its own text and voice', async () => {
    const primary = portFixture(), fallback = portFixture()
    const old = deferred<SpeechResult>()
    primary.speak.mockReturnValueOnce(old.promise).mockResolvedValueOnce(failed)
    const port = createFallbackSpeechPort(primary, fallback)
    const first = port.speak('合成旧句')
    const second = port.speak('我不想吃饭', { voice: 'synthetic', rate: 0.8 })
    old.resolve(failed)
    await expect(first).resolves.toMatchObject({ reason: 'stopped' })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(fallback.speak).toHaveBeenCalledTimes(1)
    expect(fallback.speak).toHaveBeenCalledWith('我不想吃饭', { voice: 'synthetic', rate: 0.8 })
  })
  test('a late fallback success cannot replace stop with completed', async () => {
    const primary = portFixture(), fallback = portFixture()
    const late = deferred<SpeechResult>()
    primary.speak.mockResolvedValue(failed)
    fallback.speak.mockReturnValue(late.promise)
    const port = createFallbackSpeechPort(primary, fallback)
    const result = port.speak('合成等待')
    await flush()
    port.stop()
    late.resolve(success)
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'stopped' })
  })
  test('stopping one broken device still stops the other provider and settles', async () => {
    const primary = portFixture(), fallback = portFixture()
    primary.speak.mockReturnValue(new Promise(() => {}))
    const port = createFallbackSpeechPort(primary, fallback)
    const result = port.speak('合成测试')
    primary.stop.mockImplementationOnce(() => { throw new Error('synthetic stop error') })
    expect(() => port.stop()).not.toThrow()
    expect(fallback.stop).toHaveBeenCalled()
    await expect(result).resolves.toMatchObject({ reason: 'stopped' })
  })
  test.each(['primary', 'fallback'] as const)('unexpected %s rejection returns a failure result instead of leaving the UI busy', async source => {
    const primary = portFixture(), fallback = portFixture()
    primary.speak.mockResolvedValue(failed)
    if (source === 'primary') primary.speak.mockRejectedValueOnce(new Error('synthetic failure'))
    fallback.speak.mockRejectedValueOnce(new Error('synthetic failure'))
    const port: SpeechPort = createFallbackSpeechPort(primary, fallback)
    await expect(port.speak('合成拒绝')).resolves.toMatchObject({ ok: false, reason: 'provider' })
  })
})
