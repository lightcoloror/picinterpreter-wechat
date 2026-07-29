import { describe, expect, test, vi } from 'vitest'

import type {
  DialectAudioRecorderError,
  DialectAudioRecorderStopEvent
} from './dialectAudioRecognitionPort'
import { createTileAudioRecordingPort } from './tileAudioRecordingPort'

function createHarness() {
  let startHandler: () => void = () => {}
  let stopHandler: (event: DialectAudioRecorderStopEvent) => void =
    () => {}
  let errorHandler: (error: DialectAudioRecorderError) => void =
    () => {}
  const manager = {
    onStart: vi.fn((callback: () => void) => {
      startHandler = callback
    }),
    onStop: vi.fn(
      (callback: (event: DialectAudioRecorderStopEvent) => void) => {
        stopHandler = callback
      }
    ),
    onError: vi.fn(
      (callback: (error: DialectAudioRecorderError) => void) => {
        errorHandler = callback
      }
    ),
    offStart: vi.fn(),
    offStop: vi.fn(),
    offError: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  }
  const removeFile = vi.fn().mockResolvedValue(undefined)
  const saveFile = vi.fn().mockResolvedValue({
    savedFilePath: 'wxfile://saved/tile.mp3'
  })
  const dependencies = {
    getRecorderManager: vi.fn(() => manager),
    getFileSize: vi.fn().mockResolvedValue(4),
    saveFile,
    removeFile,
    setTimer: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
    clearTimer: vi.fn(),
    cancelCleanupDelayMs: 100
  }
  const port = createTileAudioRecordingPort(dependencies)

  return {
    port,
    manager,
    dependencies,
    removeFile,
    saveFile,
    emitStart: () => startHandler(),
    emitStop: (event: DialectAudioRecorderStopEvent) =>
      stopHandler(event),
    emitError: () => errorHandler({ errMsg: 'permission denied' })
  }
}

describe('tile audio recording port', () => {
  test('records the same bounded mono MP3 used by the existing dialect recorder', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.start()

    harness.emitStart()
    harness.port.stop()
    harness.emitStop({
      tempFilePath: 'wxfile://temp/tile.mp3',
      duration: 1200,
      fileSize: 4
    })

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      message: '图卡录音已保存，请试听后再保存图卡。',
      sound: 'wxfile://saved/tile.mp3'
    })
    expect(harness.manager.start).toHaveBeenCalledWith({
      duration: 30_000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    })
    expect(harness.manager.stop).toHaveBeenCalled()
    expect(harness.saveFile).toHaveBeenCalledWith(
      'wxfile://temp/tile.mp3'
    )
    await vi.waitFor(() =>
      expect(harness.removeFile).toHaveBeenCalledWith(
        'wxfile://temp/tile.mp3'
      )
    )
  })

  test('rejects an oversized recording and cleans the temporary file', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.start()

    harness.emitStop({
      tempFilePath: 'wxfile://temp/large.mp3',
      duration: 1000,
      fileSize: 5 * 1024 * 1024 + 1
    })

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ ok: false })
    )
    expect(harness.saveFile).not.toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(harness.removeFile).toHaveBeenCalledWith(
        'wxfile://temp/large.mp3'
      )
    )
  })

  test('does not query file metadata when WeChat returns no temporary path', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.start()

    harness.emitStop({
      tempFilePath: '',
      duration: 1000
    })

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ ok: false })
    )
    expect(harness.dependencies.getFileSize).not.toHaveBeenCalled()
    expect(harness.saveFile).not.toHaveBeenCalled()
  })

  test('cancels an active recording and removes a late temporary file', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.start()

    harness.port.cancel()
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: '图卡录音已取消。'
    })
    expect(harness.manager.stop).toHaveBeenCalled()

    harness.emitStop({
      tempFilePath: 'wxfile://temp/cancelled.mp3',
      duration: 800,
      fileSize: 4
    })
    await vi.waitFor(() =>
      expect(harness.removeFile).toHaveBeenCalledWith(
        'wxfile://temp/cancelled.mp3'
      )
    )
  })

  test('reports recorder errors and safely removes saved recordings', async () => {
    const harness = createHarness()
    const resultPromise = harness.port.start()

    harness.emitError()

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: '图卡录音失败，请检查麦克风权限后重试。'
    })
    await expect(
      harness.port.remove('wxfile://saved/tile.mp3')
    ).resolves.toBe(true)
  })
})
