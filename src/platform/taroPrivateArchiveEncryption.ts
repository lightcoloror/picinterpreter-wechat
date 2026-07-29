import Taro from '@tarojs/taro'
import {
  decryptPrivateArchive,
  encryptPrivateArchive
} from '@cboard-communication-core/privateArchiveEncryption'

export async function taroCryptographicRandomBytes(length: number) {
  const result = await Taro.getRandomValues({ length })
  return new Uint8Array(result.randomValues)
}

export async function encryptPrivateArchiveData(
  data: Uint8Array,
  passphrase: string,
  randomBytes = taroCryptographicRandomBytes
) {
  return encryptPrivateArchive({ data, passphrase, randomBytes })
}

export async function decryptPrivateArchiveData(
  data: Uint8Array,
  passphrase: string
) {
  return decryptPrivateArchive({ data, passphrase })
}

export const encryptPrivateDeviceDataArchive = encryptPrivateArchiveData
export const decryptPrivateDeviceDataArchive = decryptPrivateArchiveData

export function describePrivateArchiveEncryptionError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'PRIVATE_ARCHIVE_DECRYPTION_FAILED') {
    return '恢复密码不正确，或云端加密备份已被改动。'
  }
  if (code === 'PRIVATE_ARCHIVE_INVALID_FORMAT') {
    return '下载内容不是图语家端侧加密备份，未恢复本机数据。'
  }
  if (
    code === 'PRIVATE_ARCHIVE_UNSUPPORTED_VERSION' ||
    code === 'PRIVATE_ARCHIVE_UNSUPPORTED_KDF'
  ) {
    return '该加密备份版本暂不受支持，请使用创建备份时的新版图语家恢复。'
  }
  if (code === 'PRIVATE_ARCHIVE_RANDOM_UNAVAILABLE') {
    return '当前微信版本未提供安全随机数，无法生成加密备份。'
  }
  return '端侧加密或解密失败，本机数据和已有云端备份都没有改变。'
}
