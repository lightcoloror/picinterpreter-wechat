export const PRIVATE_PICTURE_LIBRARY_MAX_BYTES = 20 * 1024 * 1024

export interface PrivatePictureLibraryMetadata {
  format:
    | 'picinterpreter-picture-library'
    | 'picinterpreter-private-picture-library-encrypted'
    | 'picinterpreter-private-device-data-encrypted'
  contractVersion: 1 | 2
  size: number
  sha256: string
  createdAt: number
  updatedAt: number
}

export interface PrivatePictureLibraryCloudResult<T> {
  ok: boolean
  message: string
  value?: T
}

export interface PrivatePictureLibraryCloudPort {
  readonly configured: boolean
  getMetadata(): Promise<
    PrivatePictureLibraryCloudResult<PrivatePictureLibraryMetadata>
  >
  upload(
    data: Uint8Array
  ): Promise<PrivatePictureLibraryCloudResult<PrivatePictureLibraryMetadata>>
  download(): Promise<
    PrivatePictureLibraryCloudResult<{ name: string; data: Uint8Array }>
  >
  delete(): Promise<PrivatePictureLibraryCloudResult<{ deleted: boolean }>>
}

export interface PrivatePictureLibraryCloudDependencies {
  apiBaseUrl: string
  getAuthToken: () => string
  request: (options: {
    url: string
    method: 'GET' | 'DELETE'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
  uploadArchive: (options: {
    url: string
    data: Uint8Array
    fileName: string
    fieldName: 'file'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
  downloadArchive: (options: {
    url: string
    header: Record<string, string>
  }) => Promise<{
    statusCode: number
    data?: ArrayBuffer | Uint8Array
  }>
}

interface PrivateArchiveCloudConfig {
  apiPath: string
  downloadPath: string
  fileName: string
  archiveLabel: string
  localContentLabel: string
  restoreTargetLabel: string
  format: PrivatePictureLibraryMetadata['format']
  contractVersion: PrivatePictureLibraryMetadata['contractVersion']
  archiveDescription: string
  validateArchive: (data: Uint8Array) => boolean
}

const PRIVATE_PICTURE_LIBRARY_CONFIG: PrivateArchiveCloudConfig = {
  apiPath: '/communication/private-library',
  downloadPath: '/communication/private-library/download',
  fileName: 'picinterpreter-private-picture-library.pijenc',
  archiveLabel: '私人图片',
  localContentLabel: '图片',
  restoreTargetLabel: '图库',
  format: 'picinterpreter-private-picture-library-encrypted',
  contractVersion: 2,
  archiveDescription: '端侧加密备份',
  validateArchive: isEncryptedPrivateArchive
}

const PRIVATE_DEVICE_DATA_CONFIG: PrivateArchiveCloudConfig = {
  apiPath: '/communication/private-device-data',
  downloadPath: '/communication/private-device-data/download',
  fileName: 'picinterpreter-private-device-data.pijenc',
  archiveLabel: '完整私有数据',
  localContentLabel: '数据',
  restoreTargetLabel: '数据',
  format: 'picinterpreter-private-device-data-encrypted',
  contractVersion: 2,
  archiveDescription: '端侧加密备份',
  validateArchive: isEncryptedPrivateArchive
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch (error) {
    return null
  }
}

function normalizeMetadata(
  value: unknown,
  config: PrivateArchiveCloudConfig
): PrivatePictureLibraryMetadata | null {
  const record = parseObject(value)
  if (!record) return null
  const size = Number(record.size)
  const createdAt = Number(record.createdAt)
  const updatedAt = Number(record.updatedAt)
  const sha256 = String(record.sha256 || '').trim()
  if (
    record.format !== config.format ||
    Number(record.contractVersion) !== config.contractVersion ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > PRIVATE_PICTURE_LIBRARY_MAX_BYTES ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !Number.isFinite(createdAt) ||
    createdAt < 1 ||
    !Number.isFinite(updatedAt) ||
    updatedAt < createdAt
  ) return null

  return {
    format: config.format,
    contractVersion: config.contractVersion,
    size,
    sha256,
    createdAt,
    updatedAt
  }
}

function toUint8Array(value: ArrayBuffer | Uint8Array | undefined) {
  if (!value) return new Uint8Array()
  return value instanceof Uint8Array ? value : new Uint8Array(value)
}

function isEncryptedPrivateArchive(data: Uint8Array) {
  const magic = [0x50, 0x49, 0x45, 0x32, 0x45, 0x45, 0x30, 0x31]
  return (
    data.byteLength > magic.length &&
    magic.every((value, index) => data[index] === value)
  )
}

function requestError(
  statusCode: number,
  action: string,
  config: PrivateArchiveCloudConfig
) {
  if (statusCode === 401 || statusCode === 403) {
    return `登录已失效，请重新登录后再管理${config.archiveLabel}备份。`
  }
  if (statusCode === 404) return `账号中还没有${config.archiveLabel}备份。`
  if (statusCode === 413) {
    return `${config.archiveLabel}备份超过 20 MiB，未上传。`
  }
  if (statusCode === 503) {
    return `服务器尚未配置账号${config.archiveLabel}存储，本机 ZIP 备份仍可正常使用。`
  }
  if (statusCode === 409) {
    return '该云端备份是旧版明文格式。请在原设备设置恢复密码并重新上传后再恢复。'
  }
  if (statusCode === 502) {
    return `云端备份完整性校验失败，未恢复本机${config.restoreTargetLabel}。`
  }
  return `${action}暂时不可用，本机${config.localContentLabel}没有改变。`
}

function createPrivateArchiveCloudPort(
  dependencies: PrivatePictureLibraryCloudDependencies,
  config: PrivateArchiveCloudConfig
): PrivatePictureLibraryCloudPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = /^https?:\/\/[^/]+/i.test(apiBaseUrl)

  function authorize() {
    if (!configured) {
      return {
        ok: false as const,
        message: '尚未配置 cboard-api 地址，本机 ZIP 备份仍可正常使用。'
      }
    }
    const token = String(dependencies.getAuthToken() || '').trim()
    return token
      ? { ok: true as const, header: { Authorization: `Bearer ${token}` } }
      : {
          ok: false as const,
          message: `请先登录，再使用跨设备${config.archiveLabel}备份。`
        }
  }

  return {
    configured,

    async getMetadata() {
      const auth = authorize()
      if (!auth.ok) return auth
      try {
        const response = await dependencies.request({
          url: `${apiBaseUrl}${config.apiPath}`,
          method: 'GET',
          header: auth.header
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return {
            ok: false,
            message: requestError(
              response.statusCode,
              '读取云端备份',
              config
            )
          }
        }
        const metadata = normalizeMetadata(response.data, config)
        return metadata
          ? { ok: true, message: '已读取云端备份信息。', value: metadata }
          : {
              ok: false,
              message: '云端备份信息格式无效，本机图片没有改变。'
            }
      } catch (error) {
        return {
          ok: false,
          message: '网络不可用，本机 ZIP 备份仍可正常使用。'
        }
      }
    },

    async upload(data) {
      const auth = authorize()
      if (!auth.ok) return auth
      if (
        !config.validateArchive(data) ||
        data.byteLength > PRIVATE_PICTURE_LIBRARY_MAX_BYTES
      ) {
        return {
          ok: false,
          message: `${config.archiveLabel}备份必须是 20 MiB 以内的有效${config.archiveDescription}。`
        }
      }
      try {
        const response = await dependencies.uploadArchive({
          url: `${apiBaseUrl}${config.apiPath}`,
          data,
          fileName: config.fileName,
          fieldName: 'file',
          header: auth.header
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return {
            ok: false,
            message: requestError(
              response.statusCode,
              '上传云端备份',
              config
            )
          }
        }
        const metadata = normalizeMetadata(response.data, config)
        return metadata
          ? {
              ok: true,
              message: `${config.archiveLabel}已备份到当前 CBoard 账号。`,
              value: metadata
            }
          : {
              ok: false,
              message: '服务器未返回可靠的备份信息，请稍后核对。'
            }
      } catch (error) {
        return {
          ok: false,
          message: `上传响应未确认，本机${config.localContentLabel}没有改变；云端备份可能已经更新。请先使用“下载、复核并恢复”核对，再决定是否重试。`
        }
      }
    },

    async download() {
      const auth = authorize()
      if (!auth.ok) return auth
      try {
        const response = await dependencies.downloadArchive({
          url: `${apiBaseUrl}${config.downloadPath}`,
          header: auth.header
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return {
            ok: false,
            message: requestError(
              response.statusCode,
              '下载云端备份',
              config
            )
          }
        }
        const data = toUint8Array(response.data)
        if (
          !config.validateArchive(data) ||
          data.byteLength > PRIVATE_PICTURE_LIBRARY_MAX_BYTES
        ) {
          return {
            ok: false,
            message: `下载内容不是有效的${config.archiveLabel}${config.archiveDescription}，未恢复本机${config.restoreTargetLabel}。`
          }
        }
        return {
          ok: true,
          message: '云端备份已下载，等待确认恢复。',
          value: {
            name: config.fileName,
            data
          }
        }
      } catch (error) {
        return {
          ok: false,
          message: `下载失败，本机${config.localContentLabel}没有改变。`
        }
      }
    },

    async delete() {
      const auth = authorize()
      if (!auth.ok) return auth
      try {
        const response = await dependencies.request({
          url: `${apiBaseUrl}${config.apiPath}`,
          method: 'DELETE',
          header: auth.header
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return {
            ok: false,
            message: requestError(
              response.statusCode,
              '删除云端备份',
              config
            )
          }
        }
        const responseData = parseObject(response.data)
        const deleted = Boolean(responseData && responseData.deleted === true)
        return {
          ok: true,
          message: deleted
            ? `云端${config.archiveLabel}备份已删除，本机${config.localContentLabel}仍保留。`
            : `账号中没有需要删除的${config.archiveLabel}备份。`,
          value: { deleted }
        }
      } catch (error) {
        return {
          ok: false,
          message: `删除云端备份失败，本机${config.localContentLabel}仍保留。`
        }
      }
    }
  }
}

export function createPrivatePictureLibraryCloudPort(
  dependencies: PrivatePictureLibraryCloudDependencies
) {
  return createPrivateArchiveCloudPort(
    dependencies,
    PRIVATE_PICTURE_LIBRARY_CONFIG
  )
}

export function createPrivateDeviceDataCloudPort(
  dependencies: PrivatePictureLibraryCloudDependencies
) {
  return createPrivateArchiveCloudPort(
    dependencies,
    PRIVATE_DEVICE_DATA_CONFIG
  )
}
