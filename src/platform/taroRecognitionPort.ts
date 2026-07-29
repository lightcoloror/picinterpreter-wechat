import {
  createWechatRecognitionPort,
  type WechatSIRecognitionPlugin
} from './recognitionPort'

export const wechatRecognitionPort = createWechatRecognitionPort({
  requirePlugin(name) {
    if (typeof requirePlugin !== 'function') {
      throw new Error('WechatSI is unavailable')
    }
    return requirePlugin(name) as WechatSIRecognitionPlugin
  },
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer),
  durationMs: 30_000,
  timeoutMs: 40_000
})
