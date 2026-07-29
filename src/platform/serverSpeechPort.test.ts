import { describe, expect, test, vi } from 'vitest'

import { createServerSpeechPort } from './serverSpeechPort'

function createHarness(
  options: {
    token?: string
    statusCode?: number
    deferRequest?: boolean
  } = {}
) {
  let onEnded: (() => void) | undefined
  let onError: (() => void) | undefined
  let expireTimer: (() => void) | undefined
  let resolveRequest:
    | ((response: { statusCode: number; data: ArrayBuffer }) => void)
    | undefined
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
  const data = new TextEncoder().encode('mp3-audio').buffer
  const response = {
    statusCode: options.statusCode || 200,
    data
  }
  const request = vi.fn(async () => {
    if (!options.deferRequest) return response
    return await new Promise<typeof response>(resolve => {
      resolveRequest = resolve
    })
  })
  const writeTempAudio = vi.fn(async () => 'wxfile://tmp/speech.mp3')
  const unlinkFile = vi.fn(async () => {})
  const clearTimer = vi.fn()

  const port = createServerSpeechPort({
    apiBaseUrl: 'https://api.example.test/',
    getAuthToken: () =>
      options.token === undefined ? 'token' : options.token,
    request,
    writeTempAudio,
    unlinkFile,
    createInnerAudioContext: () => audio,
    setTimer: callback => {
      expireTimer = callback
      return {} as ReturnType<typeof setTimeout>
    },
    clearTimer,
    timeoutMs: 50
  })

  return {
    port,
    request,
    writeTempAudio,
    unlinkFile,
    audio,
    endPlayback: () => onEnded?.(),
    failPlayback: () => onError?.(),
    expireTimer: () => expireTimer?.(),
    resolveRequest: () => resolveRequest?.(response)
  }
}

describe('server speech port', () => {
  test('requires login before sending patient text to the paid endpoint', async () => {
    const harness = createHarness({ token: '' })

    await expect(harness.port.speak('我想喝水。')).resolves.toEqual({
      ok: false,
      message: '登录后可使用 cboard-api 语音回退。',
      reason: 'unavailable'
    })
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('posts bounded text, plays the MP3 and deletes its temporary file', async () => {
    const harness = createHarness()
    const result = harness.port.speak('  我想喝水。  ', {
      rate: 1.4,
      voice: ' verse '
    })
    await vi.waitFor(() => expect(harness.audio.play).toHaveBeenCalledOnce())

    expect(harness.request).toHaveBeenCalledWith({
      url: 'https://api.example.test/gpt/communication/speech',
      method: 'POST',
      data: { text: '我想喝水。', rate: 1.4, voice: 'verse' },
      header: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token'
      },
      responseType: 'arraybuffer'
    })
    expect(harness.audio.src).toBe('wxfile://tmp/speech.mp3')

    harness.endPlayback()
    await expect(result).resolves.toEqual({ ok: true, message: '朗读完成。' })
    expect(harness.unlinkFile).toHaveBeenCalledWith(
      'wxfile://tmp/speech.mp3'
    )
    expect(harness.audio.destroy).toHaveBeenCalledOnce()
  })

  test('cleans up and settles when playback fails', async () => {
    const harness = createHarness()
    const result = harness.port.speak('需要帮助。')
    await vi.waitFor(() => expect(harness.audio.play).toHaveBeenCalledOnce())

    harness.failPlayback()
    await expect(result).resolves.toEqual({
      ok: false,
      message: '服务端语音播放失败，请重试。',
      reason: 'playback'
    })
    expect(harness.unlinkFile).toHaveBeenCalledOnce()
  })

  test('does not write an error response as audio', async () => {
    const harness = createHarness({ statusCode: 503 })

    await expect(harness.port.speak('需要帮助。')).resolves.toEqual({
      ok: false,
      message: '服务端尚未配置语音模型。',
      reason: 'unavailable'
    })
    expect(harness.writeTempAudio).not.toHaveBeenCalled()
  })

  test('keeps WeChat speech available when the server quota is limited', async () => {
    const harness = createHarness({ statusCode: 429 })

    const result = await harness.port.speak('需要帮助。')

    expect(result.message).toContain('请稍后重试')
    expect(result.message).toContain('微信朗读')
    expect(harness.writeTempAudio).not.toHaveBeenCalled()
  })

  test('ignores a successful response that arrives after timeout', async () => {
    const harness = createHarness({ deferRequest: true })
    const result = harness.port.speak('需要帮助。')
    await vi.waitFor(() => expect(harness.request).toHaveBeenCalledOnce())

    harness.expireTimer()
    await expect(result).resolves.toEqual({
      ok: false,
      message: '服务端朗读等待超时，请重试。',
      reason: 'timeout'
    })

    harness.resolveRequest()
    await Promise.resolve()
    expect(harness.writeTempAudio).not.toHaveBeenCalled()
    expect(harness.audio.play).not.toHaveBeenCalled()
  })
})
