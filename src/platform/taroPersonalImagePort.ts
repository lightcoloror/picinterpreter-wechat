import Taro from '@tarojs/taro'

import {
  createPersonalImagePort,
  preparePersonalImagePath
} from './personalImagePort'

function isMissingFileError(error: unknown) {
  const message = String(
    error && typeof error === 'object' && 'errMsg' in error
      ? (error as { errMsg?: unknown }).errMsg
      : error || ''
  ).toLocaleLowerCase()
  return message.includes('no such file') || message.includes('not exist')
}

function unlinkFile(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    Taro.getFileSystemManager().unlink({
      filePath,
      success: () => resolve(),
      fail: reject
    })
  })
}

async function removePrivateImage(filePath: string) {
  try {
    await Taro.removeSavedFile({ filePath })
  } catch (error) {
    try {
      await unlinkFile(filePath)
    } catch (unlinkError) {
      if (!isMissingFileError(unlinkError)) throw unlinkError
    }
  }
}

export const taroPersonalImagePort = createPersonalImagePort({
  chooseImage: async () => {
    const result = await Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original']
    })
    const selected = result.tempFiles && result.tempFiles[0]

    if (!selected) return null

    const originalPath = String(selected.tempFilePath || '')
    let selectedType = ''
    const tempFilePath = await preparePersonalImagePath(originalPath, {
      getImageType: async source => {
        const image = await Taro.getImageInfo({ src: source })
        selectedType = String(image.type || '').toLocaleLowerCase()
        return selectedType
      },
      compressImage: async source => {
        const compressed = await Taro.compressImage({
          src: source,
          quality: 80
        })
        return String(compressed.tempFilePath || '')
      }
    })

    return {
      tempFilePath,
      mediaType: selectedType === 'gif' ? 'gif' : 'image'
    }
  },
  saveFile: async tempFilePath => {
    const result = await Taro.saveFile({ tempFilePath })
    if (!('savedFilePath' in result) || !result.savedFilePath) {
      throw new Error('Wechat did not return a saved image path')
    }
    return { savedFilePath: result.savedFilePath }
  },
  removeSavedFile: async filePath => {
    await removePrivateImage(filePath)
  }
})
