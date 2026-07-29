export interface PictureLibraryBinaryAsset {
  data: Uint8Array
  mediaType: string
  size: number
}

export type PictureLibraryMediaKind = 'image' | 'sound' | 'video'

export interface PictureLibrarySelectedArchive {
  name: string
  data: Uint8Array
}

export interface PictureLibraryArchivePortResult<T> {
  ok: boolean
  message: string
  value?: T
}

export interface PictureLibraryRestoreSession {
  writeAsset(path: string, data: Uint8Array): Promise<string>
  cleanup(): Promise<void>
}

export interface PictureLibraryArchivePort {
  readAsset(
    source: string,
    mediaKind: PictureLibraryMediaKind
  ): Promise<PictureLibraryBinaryAsset>
  chooseArchive(extensions?: string[]): Promise<
    PictureLibraryArchivePortResult<PictureLibrarySelectedArchive>
  >
  shareArchive(
    fileName: string,
    data: Uint8Array
  ): Promise<PictureLibraryArchivePortResult<string>>
  createRestoreSession(): Promise<PictureLibraryRestoreSession>
}

export function detectPictureLibraryImageExtension(data: Uint8Array) {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) return 'png'
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) return 'jpg'
  if (
    data.length >= 6 &&
    String.fromCharCode(...data.slice(0, 3)) === 'GIF'
  ) return 'gif'
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.slice(8, 12)) === 'WEBP'
  ) return 'webp'
  return ''
}

interface PictureLibraryArchiveDependencies {
  chooseFile(extensions: string[]): Promise<{ name: string; path: string } | null>
  readBinary(path: string): Promise<ArrayBuffer | Uint8Array>
  readSourceBinary(source: string): Promise<ArrayBuffer | Uint8Array>
  writeArchive(fileName: string, data: Uint8Array): Promise<string>
  shareFile(path: string): Promise<void>
  createRestoreRoot(): Promise<string>
  writeAsset(
    root: string,
    path: string,
    data: Uint8Array
  ): Promise<string>
  removeRestoreRoot(root: string): Promise<void>
}

function toUint8Array(value: ArrayBuffer | Uint8Array) {
  return value instanceof Uint8Array ? value : new Uint8Array(value)
}

function inferMediaType(
  source: string,
  mediaKind: PictureLibraryMediaKind
) {
  const normalized = source.toLocaleLowerCase().split(/[?#]/)[0]
  const dataMatch = normalized.match(/^data:([^;,]+)[;,]/)
  if (dataMatch) return dataMatch[1]
  if (mediaKind === 'video') {
    if (normalized.endsWith('.webm')) return 'video/webm'
    return 'video/mp4'
  }
  if (mediaKind === 'sound') {
    if (normalized.endsWith('.aac')) return 'audio/aac'
    if (normalized.endsWith('.m4a') || normalized.endsWith('.mp4')) {
      return 'audio/mp4'
    }
    if (normalized.endsWith('.ogg')) return 'audio/ogg'
    if (normalized.endsWith('.wav')) return 'audio/wav'
    if (normalized.endsWith('.webm')) return 'audio/webm'
    return 'audio/mpeg'
  }
  if (normalized.endsWith('.svg')) return 'image/svg+xml'
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (normalized.endsWith('.gif')) return 'image/gif'
  if (normalized.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

function normalizeFileName(value: string) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 120)
}

export function isSafePictureLibraryAssetPath(value: string) {
  const path = String(value || '').trim().replace(/\\/g, '/')
  return Boolean(
    path &&
      (path.startsWith('images/') ||
        path.startsWith('sounds/') ||
        path.startsWith('videos/')) &&
      !path.startsWith('/') &&
      !path.includes('\0') &&
      path.split('/').every(part => part && part !== '.' && part !== '..')
  )
}

export function createPictureLibraryArchivePort(
  dependencies: PictureLibraryArchiveDependencies
): PictureLibraryArchivePort {
  return {
    async readAsset(source, mediaKind) {
      const data = toUint8Array(
        await dependencies.readSourceBinary(source)
      )
      if (!data.byteLength) {
          throw new TypeError('Picture library media asset is empty')
      }
      return {
        data,
          mediaType: inferMediaType(source, mediaKind),
        size: data.byteLength
      }
    },

    async chooseArchive(extensions = ['zip']) {
      try {
        const selected = await dependencies.chooseFile(extensions)
        if (!selected) {
          return { ok: false, message: '已取消选择备份文件。' }
        }
        const data = toUint8Array(
          await dependencies.readBinary(selected.path)
        )
        if (!data.byteLength) {
          return { ok: false, message: '所选 ZIP 文件是空的。' }
        }
        return {
          ok: true,
          message: `已读取「${selected.name}」。`,
          value: { name: selected.name, data }
        }
      } catch (error) {
        return {
          ok: false,
          message: '读取失败，请选择有效的图语家图库 ZIP。'
        }
      }
    },

    async shareArchive(fileName, data) {
      const safeName = normalizeFileName(fileName)
      if (!safeName || !data.byteLength) {
        return { ok: false, message: '没有可导出的图库内容。' }
      }
      try {
        const path = await dependencies.writeArchive(safeName, data)
        await dependencies.shareFile(path)
        return {
          ok: true,
          message: '图库 ZIP 已生成，可转发或保存到其他位置。',
          value: path
        }
      } catch (error) {
        return { ok: false, message: '图库 ZIP 分享失败，请稍后重试。' }
      }
    },

    async createRestoreSession() {
      const root = await dependencies.createRestoreRoot()
      return {
        async writeAsset(path, data) {
          if (!isSafePictureLibraryAssetPath(path) || !data.byteLength) {
            throw new TypeError('Unsafe or empty picture library asset')
          }
          return dependencies.writeAsset(root, path, data)
        },
        async cleanup() {
          await dependencies.removeRestoreRoot(root)
        }
      }
    }
  }
}
