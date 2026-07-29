import { describe, expect, test, vi } from 'vitest'

import {
  createPersonalVideoPort,
  PERSONAL_VIDEO_MAX_SIZE_BYTES
} from './personalVideoPort'

function selectedVideo(overrides = {}) {
  return {
    tempFilePath: 'wxfile://temp/action.mp4',
    thumbTempFilePath: 'wxfile://temp/action.jpg',
    size: 4 * 1024 * 1024,
    duration: 6,
    ...overrides
  }
}

describe('personal video port', () => {
  test('compresses and persists both video and poster', async () => {
    const saveFile = vi
      .fn()
      .mockResolvedValueOnce({ savedFilePath: 'wxfile://saved/action.mp4' })
      .mockResolvedValueOnce({ savedFilePath: 'wxfile://saved/action.jpg' })
    const port = createPersonalVideoPort({
      chooseVideo: async () => selectedVideo(),
      compressVideo: async () => ({
        tempFilePath: 'wxfile://temp/action-compressed.mp4',
        size: 2 * 1024 * 1024
      }),
      saveFile,
      removeSavedFile: vi.fn(async () => undefined)
    })

    await expect(port.selectAndSave()).resolves.toEqual({
      ok: true,
      message: '短视频和封面已保存到当前设备。',
      mediaType: 'video',
      image: 'wxfile://saved/action.jpg',
      video: 'wxfile://saved/action.mp4',
      duration: 6
    })
    expect(saveFile).toHaveBeenNthCalledWith(
      1,
      'wxfile://temp/action-compressed.mp4'
    )
    expect(saveFile).toHaveBeenNthCalledWith(
      2,
      'wxfile://temp/action.jpg'
    )
  })

  test('rejects long or oversized video before persistence', async () => {
    const saveFile = vi.fn()
    const longPort = createPersonalVideoPort({
      chooseVideo: async () => selectedVideo({ duration: 11 }),
      compressVideo: vi.fn(),
      saveFile,
      removeSavedFile: vi.fn()
    })
    const largePort = createPersonalVideoPort({
      chooseVideo: async () => selectedVideo(),
      compressVideo: async () => ({
        tempFilePath: 'wxfile://temp/large.mp4',
        size: PERSONAL_VIDEO_MAX_SIZE_BYTES + 1
      }),
      saveFile,
      removeSavedFile: vi.fn()
    })

    await expect(longPort.selectAndSave()).resolves.toEqual({
      ok: false,
      message: '请选择 10 秒以内的短视频。'
    })
    await expect(largePort.selectAndSave()).resolves.toEqual({
      ok: false,
      message: '视频压缩后仍超过 8 MiB，请缩短或降低清晰度。'
    })
    expect(saveFile).not.toHaveBeenCalled()
  })

  test('rolls back the saved video when poster persistence fails', async () => {
    const removeSavedFile = vi.fn(async () => undefined)
    const port = createPersonalVideoPort({
      chooseVideo: async () => selectedVideo(),
      compressVideo: async () => ({
        tempFilePath: 'wxfile://temp/action-compressed.mp4',
        size: 2 * 1024 * 1024
      }),
      saveFile: vi
        .fn()
        .mockResolvedValueOnce({ savedFilePath: 'wxfile://saved/action.mp4' })
        .mockRejectedValueOnce(new Error('quota exceeded')),
      removeSavedFile
    })

    await expect(port.selectAndSave()).resolves.toEqual({
      ok: false,
      message: '短视频选择、压缩或保存失败，请稍后重试。'
    })
    expect(removeSavedFile).toHaveBeenCalledWith(
      'wxfile://saved/action.mp4'
    )
  })
})
