import { describe, expect, test, vi } from 'vitest'

import { createWechatSpeechPort } from './speechPort'

function createHarness() {
  let synthesisOptions: any
  let onEnded: (() => void) | undefined
  let onError: (() => void) | undefined
  let timeoutCallback: (() => void) | undefined

  const audio = {
    src: '',
    autoplay: false,
    playbackRate: 1,
    play: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    onEnded: vi.fn((callback: () => void) => {
      onEnded = callback
    }),
    onError: vi.fn((callback: () => void) => {
      onError = callback
    })
  }
  const textToSpeech = vi.fn((options: any) => {
    synthesisOptions = options
  })
  const clearTimer = vi.fn()
  const timer = {} as ReturnType<typeof setTimeout>

  const port = createWechatSpeechPort({
    requirePlugin: () => ({ textToSpeech }),
    createInnerAudioContext: () => audio,
    setTimer: callback => {
      timeoutCallback = callback
      return timer
    },
    clearTimer,
    timeoutMs: 50
  })

  return {
    port,
    audio,
    textToSpeech,
    clearTimer,
    getSynthesisOptions: () => synthesisOptions,
    endPlayback: () => onEnded?.(),
    failPlayback: () => onError?.(),
    expire: () => timeoutCallback?.()
  }
}

describe('WeChat speech port', () => {
  test('reports the account-side setup when the plugin is unavailable', async () => {
    const port = createWechatSpeechPort({
      requirePlugin: () => {
        throw new Error('plugin is not declared')
      }
    })

    expect(port.available).toBe(false)
    await expect(port.speak('我想喝水。')).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('正式 AppID'),
      reason: 'unavailable'
    })
  })

  test('synthesizes Chinese text and plays the returned audio', async () => {
    const harness = createHarness()
    const result = harness.port.speak('  我想喝水。  ', { rate: 1.3 })

    expect(harness.port.available).toBe(true)
    expect(harness.textToSpeech).toHaveBeenCalledOnce()
    expect(harness.getSynthesisOptions()).toMatchObject({
      lang: 'zh_CN',
      tts: true,
      content: '我想喝水。'
    })

    harness.getSynthesisOptions().success({
      retcode: 0,
      filename: 'https://example.test/speech.mp3'
    })

    expect(harness.audio.src).toBe('https://example.test/speech.mp3')
    expect(harness.audio.playbackRate).toBe(1.3)
    expect(harness.audio.play).toHaveBeenCalledOnce()

    harness.endPlayback()
    await expect(result).resolves.toEqual({ ok: true, message: '朗读完成。' })
    expect(harness.audio.stop).toHaveBeenCalledOnce()
    expect(harness.audio.destroy).toHaveBeenCalledOnce()
    expect(harness.clearTimer).toHaveBeenCalledOnce()
  })

  test('returns a stable message when generated audio cannot play', async () => {
    const harness = createHarness()
    const result = harness.port.speak('需要休息。')

    harness.getSynthesisOptions().success({
      retcode: 0,
      filename: 'https://example.test/speech.mp3'
    })
    harness.failPlayback()

    await expect(result).resolves.toEqual({
      ok: false,
      message: '语音播放失败，请重试。',
      reason: 'playback'
    })
  })

  test('accepts a successful response when the plugin omits retcode', async () => {
    const harness = createHarness()
    const result = harness.port.speak('我想喝水。')

    harness.getSynthesisOptions().success({
      filename: 'https://example.test/speech.mp3'
    })
    harness.endPlayback()

    await expect(result).resolves.toEqual({ ok: true, message: '朗读完成。' })
  })

  test('stops and settles the active request', async () => {
    const harness = createHarness()
    const result = harness.port.speak('我不舒服。')

    harness.port.stop()

    await expect(result).resolves.toEqual({
      ok: false,
      message: '朗读已停止。',
      reason: 'stopped'
    })
    expect(harness.clearTimer).toHaveBeenCalledOnce()
  })

  test('does not leave the interface busy after a timeout', async () => {
    const harness = createHarness()
    const result = harness.port.speak('请帮帮我。')

    harness.expire()

    await expect(result).resolves.toEqual({
      ok: false,
      message: '朗读等待超时，请重试。',
      reason: 'timeout'
    })
    harness.getSynthesisOptions().success({
      filename: 'https://example.test/late-speech.mp3'
    })
    expect(harness.audio.play).not.toHaveBeenCalled()
  })
})
