import Taro from '@tarojs/taro'

export function saveBase64PngToUserData(
  imageBase64: string,
  prefix = 'picinterpreter-image'
) {
  const userDataPath = String(Taro.env.USER_DATA_PATH || '').trim()
  if (!userDataPath) {
    throw new TypeError('Wechat user data path is unavailable')
  }
  const safePrefix = String(prefix || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .slice(0, 48) || 'picinterpreter-image'
  const suffix =
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  const filePath = `${userDataPath}/${safePrefix}-${suffix}.png`
  const data = Taro.base64ToArrayBuffer(imageBase64)

  return new Promise<string>((resolve, reject) => {
    Taro.getFileSystemManager().writeFile({
      filePath,
      data,
      success: () => resolve(filePath),
      fail: reject
    })
  })
}
