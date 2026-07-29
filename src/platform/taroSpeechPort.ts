import Taro from '@tarojs/taro'

import {
  createWechatSpeechPort,
  type SpeechAudioContext,
  type WechatSIPlugin
} from './speechPort'
import { createFallbackSpeechPort } from './fallbackSpeechPort'
import { createPreferredSpeechPort } from './preferredSpeechPort'
import { createServerSpeechPort } from './serverSpeechPort'
import { taroCboardSessionStore } from './taroCboardAccountPort'
import { taroCommunicationPreferencesStore } from './taroCommunicationPreferencesStore'
import { createWechatAudioPlaybackPort } from './audioPlaybackPort'

const wechatPluginSpeechPort = createWechatSpeechPort({
  requirePlugin(name) {
    if (typeof requirePlugin !== 'function') {
      throw new Error('WechatSI is unavailable')
    }
    return requirePlugin(name) as WechatSIPlugin
  },
  createInnerAudioContext() {
    return Taro.createInnerAudioContext() as SpeechAudioContext
  },
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer),
  timeoutMs: 30_000
})

export const wechatTileAudioPort = createWechatAudioPlaybackPort({
  createInnerAudioContext: () =>
    Taro.createInnerAudioContext() as SpeechAudioContext,
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer),
  timeoutMs: 60_000
})

export const cboardApiSpeechPort = createServerSpeechPort({
  apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
  getAuthToken: () => taroCboardSessionStore.getAuthToken(),
  request: async options => {
    const response = await Taro.request({
      url: options.url,
      method: options.method,
      data: options.data,
      header: options.header,
      responseType: options.responseType
    })
    return {
      statusCode: response.statusCode,
      data: response.data
    }
  },
  writeTempAudio: data => {
    const userDataPath = String(Taro.env.USER_DATA_PATH || '').trim()
    if (!userDataPath) {
      return Promise.reject(new Error('Wechat user data path is unavailable'))
    }
    // Reuse one transient path so an interrupted app cannot accumulate audio.
    const filePath = `${userDataPath}/picinterpreter-tts-current.mp3`
    return new Promise((resolve, reject) => {
      Taro.getFileSystemManager().writeFile({
        filePath,
        data,
        success: () => resolve(filePath),
        fail: reject
      })
    })
  },
  unlinkFile: filePath =>
    new Promise(resolve => {
      Taro.getFileSystemManager().unlink({
        filePath,
        success: () => resolve(),
        fail: () => resolve()
      })
    }),
  createInnerAudioContext: () =>
    Taro.createInnerAudioContext() as SpeechAudioContext,
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer),
  timeoutMs: 30_000
})

const fallbackSpeechPort = createFallbackSpeechPort(
  wechatPluginSpeechPort,
  cboardApiSpeechPort
)

export const wechatSpeechPort = createPreferredSpeechPort(
  fallbackSpeechPort,
  () => taroCommunicationPreferencesStore.load().speechVoice
)
