import Taro from '@tarojs/taro'

import { runtimeCapabilities } from '../config/runtimeCapabilities'

import { createArasaacPictogramSearchPort } from './arasaacPictogramSearchPort'
import { createFallbackPictogramSearchPort } from './fallbackPictogramSearchPort'
import { createPictogramSearchPort } from './pictogramSearchPort'

const apiBaseUrl = runtimeCapabilities.onlinePictograms
  ? runtimeCapabilities.apiBaseUrl
  : ''
const request = (options: Parameters<typeof Taro.request>[0]) =>
  Taro.request(options)
const downloadFile = (options: Parameters<typeof Taro.downloadFile>[0]) =>
  Taro.downloadFile(options)
const saveFile = async (options: Parameters<typeof Taro.saveFile>[0]) => {
  const result = await Taro.saveFile(options)
  if (!('savedFilePath' in result) || !result.savedFilePath) {
    throw new Error('Wechat did not return a saved file path')
  }
  return { savedFilePath: result.savedFilePath }
}

const cboardApiPictogramSearchPort = createPictogramSearchPort({
  apiBaseUrl,
  request: options => Taro.request(options),
  downloadFile,
  saveFile
})

const arasaacDirectPictogramSearchPort = createArasaacPictogramSearchPort({
  request,
  downloadFile,
  saveFile
})

const onlinePictogramSearchPort = createFallbackPictogramSearchPort({
  primary: cboardApiPictogramSearchPort,
  fallback: arasaacDirectPictogramSearchPort,
  isFallbackPictogram: pictogram =>
    pictogram.image.startsWith('https://static.arasaac.org/')
})

export const taroPictogramSearchPort = runtimeCapabilities.onlinePictograms
  ? onlinePictogramSearchPort
  : cboardApiPictogramSearchPort
