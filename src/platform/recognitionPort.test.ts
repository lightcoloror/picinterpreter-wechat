import { describe, expect, test, vi } from 'vitest'

import { createWechatRecognitionPort } from './recognitionPort'

function createHarness() {
  let timeoutCallback: (() => void) | undefined
  const manager = {
    onStart: undefined as ((event: { msg?: string }) => void) | undefined,
    onRecognize: undefined as ((event: { result?: string }) => void) | undefined,
    onStop: undefined as ((event: { result?: string }) => void) | undefined,
    onError: undefined as
      | ((event: { retcode?: number; msg?: string }) => void)
      | undefined,
    start: vi.fn(),
    stop: vi.fn()
  }
  const clearTimer = vi.fn()
  const timer = {} as ReturnType<typeof setTimeout>
  const getRecordRecognitionManager = vi.fn(() => manager)

  const port = createWechatRecognitionPort({
    requirePlugin: () => ({ getRecordRecognitionManager }),
    setTimer: callback => {
      timeoutCallback = callback
      return timer
    },
    clearTimer,
    durationMs: 30_000,
    timeoutMs: 40_000
  })

  return {
    port,
    manager,
    clearTimer,
    getRecordRecognitionManager,
    recognize: (text: string) => manager.onRecognize?.({ result: text }),
    finish: (text: string) => manager.onStop?.({ result: text }),
    fail: () => manager.onError?.({ retcode: -30001, msg: 'record failed' }),
    expire: () => timeoutCallback?.()
  }
}

describe('WeChat recognition port', () => {
  test('reports the account-side setup when the plugin is unavailable', async () => {
    const port = createWechatRecognitionPort({
      requirePlugin: () => {
        throw new Error('plugin is not declared')
      },
      setTimer: setTimeout,
      clearTimer: clearTimeout,
      durationMs: 30_000,
      timeoutMs: 40_000
    })

    expect(port.available).toBe(false)
    await expect(port.start()).resolves.toEqual({
      ok: false,
      text: '',
      message: expect.stringContaining('正式 AppID')
    })
  })

  test('streams interim text and returns the final Chinese result', async () => {
    const harness = createHarness()
    const onInterim = vi.fn()
    const result = harness.port.start(onInterim)

    expect(harness.port.available).toBe(true)
    expect(harness.getRecordRecognitionManager).toHaveBeenCalledOnce()
    expect(harness.manager.start).toHaveBeenCalledWith({
      duration: 30_000,
      lang: 'zh_CN'
    })

    harness.recognize(' 想喝 ')
    harness.recognize('想喝')
    harness.recognize('   ')
    harness.recognize('想喝水')
    expect(onInterim).toHaveBeenCalledTimes(2)
    expect(onInterim).toHaveBeenNthCalledWith(1, '想喝')
    expect(onInterim).toHaveBeenNthCalledWith(2, '想喝水')

    harness.finish(' 想喝水 ')
    await expect(result).resolves.toEqual({
      ok: true,
      text: '想喝水',
      message: '语音识别完成。'
    })
    expect(harness.clearTimer).toHaveBeenCalledOnce()
  })

  test('asks the manager to stop and waits for its final result', async () => {
    const harness = createHarness()
    const result = harness.port.start()

    harness.port.stop()
    expect(harness.manager.stop).toHaveBeenCalledOnce()

    harness.finish('需要休息')
    await expect(result).resolves.toMatchObject({
      ok: true,
      text: '需要休息'
    })
  })

  test('returns a stable caregiver-facing message after a recorder error', async () => {
    const harness = createHarness()
    const result = harness.port.start()

    harness.fail()

    await expect(result).resolves.toEqual({
      ok: false,
      text: '',
      message: '语音输入失败，请检查麦克风权限和网络后重试。'
    })
  })

  test('does not leave the interface listening after a timeout', async () => {
    const harness = createHarness()
    const result = harness.port.start()

    harness.expire()

    await expect(result).resolves.toEqual({
      ok: false,
      text: '',
      message: '语音识别等待超时，请再试一次。'
    })
    expect(harness.manager.stop).toHaveBeenCalledOnce()
  })

  test('cancels and settles the previous recording before a reset', async () => {
    const harness = createHarness()
    const result = harness.port.start()

    harness.port.cancel()

    await expect(result).resolves.toEqual({
      ok: false,
      text: '',
      message: '语音输入已取消。'
    })
    expect(harness.manager.stop).toHaveBeenCalledOnce()
  })
})
