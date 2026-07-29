import { describe, expect, test, vi } from 'vitest'

import {
  createDialectAudioRecognitionPort,
  type DialectAudioRecorderError,
  type DialectAudioRecorderStopEvent
} from './dialectAudioRecognitionPort'

function createHarness() {
  let onStop:
    | ((event: DialectAudioRecorderStopEvent) => void)
    | undefined
  let onError:
    | ((error: DialectAudioRecorderError) => void)
    | undefined
  const manager = {
    onStart: vi.fn(),
    onStop: vi.fn(callback => {
      onStop = callback
    }),
    onError: vi.fn(callback => {
      onError = callback
    }),
    offStart: vi.fn(),
    offStop: vi.fn(),
    offError: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  }
  const uploadFile = vi.fn(async () => ({
    statusCode: 200,
    data: JSON.stringify({
      text: '我想饮水',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'tencentcloud-asr',
      audioDurationMs: 1260,
      audioStored: false,
      providerProcessing: true
    })
  }))
  const unlinkFile = vi.fn(async () => {})
  const getRecorderManager = vi.fn(() => manager)
  const getFileSize = vi.fn(async () => 4096)
  const port = createDialectAudioRecognitionPort({
    apiBaseUrl: 'https://api.example.test/',
    getAuthToken: () => 'session-token',
    getRecorderManager,
    getFileSize,
    uploadFile,
    unlinkFile,
    setTimer: setTimeout,
    clearTimer: clearTimeout,
    cancelCleanupDelayMs: 10
  })

  return {
    port,
    manager,
    getRecorderManager,
    getFileSize,
    uploadFile,
    unlinkFile,
    finish: (event: DialectAudioRecorderStopEvent) => onStop?.(event),
    fail: () => onError?.({ errMsg: 'record failed' })
  }
}

describe('dialect audio recognition port', () => {
  test('requires one-time consent before opening the microphone', async () => {
    const harness = createHarness()

    await expect(
      harness.port.start({ consent: false })
    ).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('先同意')
    })
    expect(harness.getRecorderManager).not.toHaveBeenCalled()
    expect(harness.uploadFile).not.toHaveBeenCalled()
  })

  test('records a bounded MP3 and returns source text without local matching', async () => {
    const harness = createHarness()
    const result = harness.port.start({ consent: true })

    expect(harness.manager.start).toHaveBeenCalledWith({
      duration: 30_000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    })
    harness.port.stop()
    expect(harness.manager.stop).toHaveBeenCalledOnce()
    harness.finish({
      tempFilePath: 'wxfile://caregiver.mp3',
      duration: 1250,
      fileSize: 4096
    })

    await expect(result).resolves.toEqual({
      ok: true,
      message: '粤语识别原文已返回，请人工确认。',
      value: {
        text: '我想饮水',
        dialect: 'cantonese',
        engine: '16k_yue',
        provider: 'tencentcloud-asr',
        audioDurationMs: 1260,
        audioStored: false,
        providerProcessing: true
      }
    })
    expect(harness.getFileSize).not.toHaveBeenCalled()
    expect(harness.uploadFile).toHaveBeenCalledWith({
      url:
        'https://api.example.test/gpt/communication/dialect-asr',
      filePath: 'wxfile://caregiver.mp3',
      name: 'audio',
      header: {
        Authorization: 'Bearer session-token'
      },
      timeout: 45_000
    })
    expect(harness.unlinkFile).toHaveBeenCalledWith(
      'wxfile://caregiver.mp3'
    )
  })

  test('accepts the Volcengine bigmodel response through the same review flow', async () => {
    const harness = createHarness()
    harness.uploadFile.mockResolvedValueOnce({
      statusCode: 200,
      data: JSON.stringify({
        text: '我想饮水',
        dialect: 'cantonese',
        engine: 'bigmodel',
        provider: 'volcengine-bigasr',
        audioDurationMs: 980,
        audioStored: false,
        providerProcessing: true
      })
    })
    const result = harness.port.start({ consent: true })

    harness.finish({
      tempFilePath: 'wxfile://caregiver.mp3',
      duration: 970,
      fileSize: 4096
    })

    await expect(result).resolves.toEqual({
      ok: true,
      message: '粤语识别原文已返回，请人工确认。',
      value: {
        text: '我想饮水',
        dialect: 'cantonese',
        engine: 'bigmodel',
        provider: 'volcengine-bigasr',
        audioDurationMs: 980,
        audioStored: false,
        providerProcessing: true
      }
    })
  })

  test('rejects an oversized recording before upload and removes it', async () => {
    const harness = createHarness()
    const result = harness.port.start({ consent: true })

    harness.finish({
      tempFilePath: 'wxfile://large.mp3',
      duration: 30_000,
      fileSize: 3 * 1024 * 1024 + 1
    })

    await expect(result).resolves.toEqual({
      ok: false,
      message: '粤语录音不能超过 3 MiB。'
    })
    expect(harness.uploadFile).not.toHaveBeenCalled()
    expect(harness.unlinkFile).toHaveBeenCalledWith(
      'wxfile://large.mp3'
    )
  })

  test('maps an unconfigured provider response to a caregiver message', async () => {
    const harness = createHarness()
    harness.uploadFile.mockResolvedValueOnce({
      statusCode: 503,
      data: '{}'
    })
    const result = harness.port.start({ consent: true })

    harness.finish({
      tempFilePath: 'wxfile://caregiver.mp3',
      duration: 800,
      fileSize: 2048
    })

    await expect(result).resolves.toEqual({
      ok: false,
      message: '服务端尚未配置粤语录音识别，请继续手工输入。'
    })
  })

  test('keeps manual input available after the monthly quota is used', async () => {
    const harness = createHarness()
    harness.uploadFile.mockResolvedValueOnce({
      statusCode: 429,
      data: JSON.stringify({
        error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
      })
    })
    const result = harness.port.start({ consent: true })

    harness.finish({
      tempFilePath: 'wxfile://caregiver.mp3',
      duration: 800,
      fileSize: 2048
    })

    await expect(result).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('本月增强服务额度已用完')
    })
    await expect(result).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('手工输入')
    })
  })

  test('settles cancellation and ignores the later recorder result', async () => {
    const harness = createHarness()
    const result = harness.port.start({ consent: true })

    harness.port.cancel()
    await expect(result).resolves.toEqual({
      ok: false,
      message: '粤语录音识别已取消。'
    })
    expect(harness.manager.stop).toHaveBeenCalledOnce()

    harness.finish({
      tempFilePath: 'wxfile://cancelled.mp3',
      duration: 500,
      fileSize: 1024
    })
    await vi.waitFor(() => {
      expect(harness.unlinkFile).toHaveBeenCalledWith(
        'wxfile://cancelled.mp3'
      )
    })
    expect(harness.uploadFile).not.toHaveBeenCalled()
  })

  test('reports microphone errors without attempting an upload', async () => {
    const harness = createHarness()
    const result = harness.port.start({ consent: true })

    harness.fail()

    await expect(result).resolves.toEqual({
      ok: false,
      message: '粤语录音失败，请检查麦克风权限后重试。'
    })
    expect(harness.uploadFile).not.toHaveBeenCalled()
  })
})
