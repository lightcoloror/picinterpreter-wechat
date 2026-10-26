import Taro from '@tarojs/taro'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'

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

// Reuse the local image-file naming pattern, with a per-session counter to
// distinguish writes issued in the same millisecond. No text or identity in names.
const speechFileSession = Date.now().toString(36) + '-' +
  Math.random().toString(36).slice(2, 8)
let speechFileSequence = 0

export const wechatTileAudioPort = createWechatAudioPlaybackPort({
  createInnerAudioContext: () =>
    Taro.createInnerAudioContext() as SpeechAudioContext,
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer),
  timeoutMs: 60_000
})

export const cboardApiSpeechPort = createServerSpeechPort({
  apiBaseUrl: apiBaseUrlFor('aiFeatures'),
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
    // Old writes/cleanup can finish after the next request starts. Never share
    // that request's file; the server speech adapter removes its own path.
    const filePath = `${userDataPath}/picinterpreter-tts-${speechFileSession}-${++speechFileSequence}.mp3`
    const fileSystem = Taro.getFileSystemManager()
    return new Promise((resolve, reject) => {
      fileSystem.writeFile({
        filePath,
        data,
        success: () => resolve(filePath),
        fail: error => {
          // A failed write can leave a partial file. Remove only this request's
          // generated path, without delaying rejection on the cleanup callback.
          try {
            fileSystem.unlink({ filePath, success: () => {}, fail: () => {} })
          } catch (_) { /* Best-effort cleanup, as on successful playback. */ }
          reject(error)
        }
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
