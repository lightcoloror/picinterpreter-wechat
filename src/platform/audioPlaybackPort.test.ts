import { describe, expect, test, vi } from 'vitest'

import { createWechatAudioPlaybackPort } from './audioPlaybackPort'
import type { SpeechAudioContext } from './speechPort'

function createHarness() {
  let ended: (() => void) | null = null
  let failed: (() => void) | null = null
  const audio: SpeechAudioContext = {
    src: '',
    autoplay: true,
    playbackRate: 1,
    play: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    onEnded: callback => {
      ended = callback
    },
    onError: callback => {
      failed = () => callback({ errMsg: 'failed' })
    }
  }
  const port = createWechatAudioPlaybackPort({
    createInnerAudioContext: () => audio,
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: timer => clearTimeout(timer),
    timeoutMs: 1000
  })

  return {
    port,
    audio,
    end: () => ended && ended(),
    fail: () => failed && failed()
  }
}

describe('WeChat personalized audio playback port', () => {
  test('plays a local recording and releases the audio context', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.play(
      'wxfile://personal/water.mp3',
      { rate: 1.4 }
    )

    expect(harness.audio.src).toBe('wxfile://personal/water.mp3')
    expect(harness.audio.playbackRate).toBe(1.4)
    expect(harness.audio.play).toHaveBeenCalledTimes(1)
    harness.end()

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      message: '个性录音播放完成。'
    })
    expect(harness.audio.destroy).toHaveBeenCalledTimes(1)
  })

  test('reports playback failure so the coordinator can use TTS fallback', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.play('wxfile://missing.mp3')
    harness.fail()

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ ok: false, reason: 'playback' })
    )
  })
})
