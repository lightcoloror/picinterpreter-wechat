import Taro from '@tarojs/taro'
import { createLocalImageVerifier } from './localImageVerification'

export const verifyTaroLocalImage = createLocalImageVerifier({
  userDataPath: Taro.env.USER_DATA_PATH || '',
  read: source => new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({ filePath: source,
      success: result => resolve(result.data), fail: reject })
  }),
  decode: source => Taro.getImageInfo({ src: source })
})
