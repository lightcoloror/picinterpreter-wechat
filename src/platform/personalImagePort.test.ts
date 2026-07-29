import { describe, expect, test, vi } from 'vitest'

import {
  createPersonalImagePort,
  preparePersonalImagePath
} from './personalImagePort'

describe('personal image port', () => {
  test('persists a selected compressed image', async () => {
    const saveFile = vi.fn(async () => ({
      savedFilePath: 'wxfile://saved/familiar-cup.jpg'
    }))
    const port = createPersonalImagePort({
      chooseImage: async () => ({ tempFilePath: 'wxfile://temp/photo.jpg' }),
      saveFile,
      removeSavedFile: vi.fn(async () => undefined)
    })

    await expect(port.selectAndSave()).resolves.toEqual({
      ok: true,
      message: '图片已保存到当前设备。',
      image: 'wxfile://saved/familiar-cup.jpg'
    })
    expect(saveFile).toHaveBeenCalledWith('wxfile://temp/photo.jpg')
  })

  test('treats picker cancellation as a safe no-op', async () => {
    const port = createPersonalImagePort({
      chooseImage: async () => {
        throw { errMsg: 'chooseMedia:fail cancel' }
      },
      saveFile: vi.fn(),
      removeSavedFile: vi.fn(async () => undefined)
    })

    await expect(port.selectAndSave()).resolves.toEqual({
      ok: false,
      message: '已取消选择图片。'
    })
  })

  test('reports persistence failure without returning a temporary path', async () => {
    const port = createPersonalImagePort({
      chooseImage: async () => ({ tempFilePath: 'wxfile://temp/photo.jpg' }),
      saveFile: async () => {
        throw new Error('quota exceeded')
      },
      removeSavedFile: vi.fn(async () => undefined)
    })

    await expect(port.selectAndSave()).resolves.toEqual({
      ok: false,
      message: '图片选择或保存失败，请稍后重试。'
    })
  })

  test('contains cleanup failure after the preference already fell back', async () => {
    const port = createPersonalImagePort({
      chooseImage: async () => null,
      saveFile: vi.fn(),
      removeSavedFile: async () => {
        throw new Error('file already removed')
      }
    })

    await expect(port.remove('wxfile://saved/old.jpg')).resolves.toBe(false)
  })
})

describe('personal image preparation', () => {
  test('keeps an animated GIF original and never calls compression', async () => {
    const getImageType = vi.fn(async () => 'gif')
    const compressImage = vi.fn(async () => 'wxfile://temp/compressed.jpg')

    await expect(
      preparePersonalImagePath('wxfile://temp/action', {
        getImageType,
        compressImage
      })
    ).resolves.toBe('wxfile://temp/action')
    expect(compressImage).not.toHaveBeenCalled()
  })

  test('compresses a static photo after checking its type', async () => {
    await expect(
      preparePersonalImagePath('wxfile://temp/photo.jpg', {
        getImageType: vi.fn(async () => 'jpeg'),
        compressImage: vi.fn(async () => 'wxfile://temp/photo-compressed.jpg')
      })
    ).resolves.toBe('wxfile://temp/photo-compressed.jpg')
  })

  test('keeps the original when type inspection is unavailable', async () => {
    const compressImage = vi.fn(async () => 'wxfile://temp/compressed.jpg')

    await expect(
      preparePersonalImagePath('wxfile://temp/photo', {
        getImageType: vi.fn(async () => {
          throw new Error('getImageInfo unavailable')
        }),
        compressImage
      })
    ).resolves.toBe('wxfile://temp/photo')
    expect(compressImage).not.toHaveBeenCalled()
  })
})
