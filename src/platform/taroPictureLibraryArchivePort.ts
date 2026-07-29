import Taro from '@tarojs/taro'

import { createPictureLibraryArchivePort } from './pictureLibraryArchivePort'

const fs = Taro.getFileSystemManager()
const SHARED_ASSET_PREFIX = '/assets/cboard-default/'
const LEGACY_ASSET_PREFIXES = [
  '/packages/caregiver/assets/cboard-default/',
  '/packages/backup/assets/cboard-default/'
]

function toArrayBuffer(data: Uint8Array) {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer
}

function readFileBinary(filePath: string) {
  return new Promise<ArrayBuffer | Uint8Array>((resolve, reject) => {
    fs.readFile({
      filePath,
      success: result => {
        if (typeof result.data === 'string') {
          reject(new TypeError('Expected binary file data'))
          return
        }
        resolve(result.data)
      },
      fail: reject
    })
  })
}

async function readPackagedOrLocalSource(source: string) {
  if (/^https:\/\//i.test(source)) {
    const downloaded = await Taro.downloadFile({ url: source })
    if (
      downloaded.statusCode < 200 ||
      downloaded.statusCode >= 300 ||
      !downloaded.tempFilePath
    ) {
      throw new TypeError('Picture download failed')
    }
    return readFileBinary(downloaded.tempFilePath)
  }

  const legacyPrefix = LEGACY_ASSET_PREFIXES.find(prefix =>
    source.startsWith(prefix)
  )
  const mapped = legacyPrefix
    ? SHARED_ASSET_PREFIX + source.slice(legacyPrefix.length)
    : source
  const candidates = mapped.startsWith('/')
    ? [mapped.slice(1), mapped]
    : [mapped]
  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      return await readFileBinary(candidate)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new TypeError('Picture source could not be read')
}

function mkdir(path: string) {
  return new Promise<void>((resolve, reject) => {
    fs.mkdir({
      dirPath: path,
      recursive: true,
      success: () => resolve(),
      fail: reject
    })
  })
}

function writeBinary(filePath: string, data: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile({
      filePath,
      data: toArrayBuffer(data),
      success: () => resolve(),
      fail: reject
    })
  })
}

export const taroPictureLibraryArchivePort =
  createPictureLibraryArchivePort({
    chooseFile: async extensions => {
      const result = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: extensions
      })
      const file = result.tempFiles[0]
      return file ? { name: file.name, path: file.path } : null
    },
    readBinary: readFileBinary,
    readSourceBinary: readPackagedOrLocalSource,
    writeArchive: async (fileName, data) => {
      const filePath = `${Taro.env.USER_DATA_PATH}/${fileName}`
      await writeBinary(filePath, data)
      return filePath
    },
    shareFile: async filePath => {
      await Taro.shareFileMessage({ filePath })
    },
    createRestoreRoot: async () => {
      const suffix = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`
      const root =
        `${Taro.env.USER_DATA_PATH}/picture-library/${suffix}`
      await mkdir(root)
      return root
    },
    writeAsset: async (root, path, data) => {
      const filePath = `${root}/${path}`
      const directory = filePath.slice(0, filePath.lastIndexOf('/'))
      await mkdir(directory)
      await writeBinary(filePath, data)
      return filePath
    },
    removeRestoreRoot: root =>
      new Promise<void>(resolve => {
        fs.rmdir({
          dirPath: root,
          recursive: true,
          success: () => resolve(),
          fail: () => resolve()
        })
      })
  })
