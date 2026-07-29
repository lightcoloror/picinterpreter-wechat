import Taro from '@tarojs/taro'

import {
  createPersonalVideoPort,
  PERSONAL_VIDEO_MAX_DURATION_SECONDS
} from './personalVideoPort'

async function removeSavedMedia(filePath: string) {
  try {
    await Taro.removeSavedFile({ filePath })
  } catch (error) {
    await new Promise<void>((resolve, reject) => {
      Taro.getFileSystemManager().unlink({
        filePath,
        success: () => resolve(),
        fail: reject
      })
    })
  }
}

export const taroPersonalVideoPort = createPersonalVideoPort({
  chooseVideo: async () => {
    const result = await Taro.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: PERSONAL_VIDEO_MAX_DURATION_SECONDS,
      sizeType: ['compressed']
    })
    const selected = result.tempFiles && result.tempFiles[0]
    if (!selected) return null

    return {
      tempFilePath: String(selected.tempFilePath || ''),
      thumbTempFilePath: String(selected.thumbTempFilePath || ''),
      size: Number(selected.size || 0),
      duration: Number(selected.duration || 0)
    }
  },
  compressVideo: async tempFilePath => {
    const result = await Taro.compressVideo({
      src: tempFilePath,
      quality: 'medium',
      bitrate: 1000,
      fps: 24,
      resolution: 0.75
    })
    return {
      tempFilePath: String(result.tempFilePath || ''),
      size: Number(result.size || 0) * 1024
    }
  },
  saveFile: async tempFilePath => {
    const result = await Taro.saveFile({ tempFilePath })
    if (!('savedFilePath' in result) || !result.savedFilePath) {
      throw new Error('Wechat did not return a saved media path')
    }
    return { savedFilePath: result.savedFilePath }
  },
  removeSavedFile: removeSavedMedia
})
