import Taro from '@tarojs/taro'

import type { DialectAudioRecorderManager } from './dialectAudioRecognitionPort'
import { taroLocalDeviceDataPort } from './taroLocalDeviceDataPort'
import { createTileAudioRecordingPort } from './tileAudioRecordingPort'

export const taroTileAudioRecordingPort =
  createTileAudioRecordingPort({
    getRecorderManager: () =>
      Taro.getRecorderManager() as unknown as DialectAudioRecorderManager,
    getFileSize: async filePath => {
      const result = await Taro.getFileInfo({ filePath })
      if (!('size' in result)) {
        throw new Error('Wechat did not return an audio size')
      }
      return Number(result.size)
    },
    saveFile: async tempFilePath => {
      const result = await Taro.saveFile({ tempFilePath })
      if (!('savedFilePath' in result) || !result.savedFilePath) {
        throw new Error('Wechat did not return a saved audio path')
      }
      return { savedFilePath: result.savedFilePath }
    },
    removeFile: async filePath => {
      const removed =
        await taroLocalDeviceDataPort.removePrivateFile(filePath)
      if (!removed) throw new Error('Wechat could not remove audio')
    },
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: timer => clearTimeout(timer),
    cancelCleanupDelayMs: 1500
  })
