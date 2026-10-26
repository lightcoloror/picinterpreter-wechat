import { currentImageOperationEpoch } from '@cboard-communication-core/imageOperationEpoch'

export interface PersonalImagePortResult {
  ok: boolean
  message: string
  image?: string
  mediaType?: 'image' | 'gif'
}

export interface PersonalImagePort {
  selectAndSave(): Promise<PersonalImagePortResult>
  remove(image: string): Promise<boolean>
}

interface PersonalImagePreparationDependencies {
  getImageType: (source: string) => Promise<string>
  compressImage: (source: string) => Promise<string>
}

export async function preparePersonalImagePath(
  source: string,
  dependencies: PersonalImagePreparationDependencies
) {
  const originalPath = String(source || '').trim()
  if (!originalPath) return ''

  const pathWithoutQuery = originalPath.toLocaleLowerCase().split(/[?#]/)[0]
  if (pathWithoutQuery.endsWith('.gif')) return originalPath

  let imageType = ''
  try {
    imageType = String(
      await dependencies.getImageType(originalPath)
    ).toLocaleLowerCase()
  } catch (error) {
    return originalPath
  }
  if (imageType === 'gif' || imageType === 'image/gif') return originalPath

  try {
    const compressed = String(
      await dependencies.compressImage(originalPath)
    ).trim()
    return compressed || originalPath
  } catch (error) {
    return originalPath
  }
}

interface PersonalImagePortDependencies {
  verifyImage?: (source: string) => Promise<{ status: string }>
  chooseImage: () => Promise<{
    tempFilePath: string
    mediaType?: 'image' | 'gif'
  } | null>
  saveFile: (tempFilePath: string) => Promise<{ savedFilePath: string }>
  removeSavedFile: (filePath: string) => Promise<void>
}

function isCancelError(error: unknown) {
  return String(
    error && typeof error === 'object' && 'errMsg' in error
      ? (error as { errMsg?: unknown }).errMsg
      : error || ''
  )
    .toLocaleLowerCase()
    .includes('cancel')
}

export function createPersonalImagePort(
  dependencies: PersonalImagePortDependencies
): PersonalImagePort {
  return {
    async selectAndSave() {
      const epoch = currentImageOperationEpoch()
      try {
        const selected = await dependencies.chooseImage()
        if (!selected) {
          return { ok: false, message: '已取消选择图片。' }
        }

        const tempFilePath = String(selected.tempFilePath || '').trim()
        if (!tempFilePath) {
          return { ok: false, message: '没有读取到有效图片。' }
        }

        const saved = await dependencies.saveFile(tempFilePath)
        const savedFilePath = String(saved.savedFilePath || '').trim()
        if (!savedFilePath) {
          return { ok: false, message: '图片无法保存到微信本机。' }
        }

        if (!dependencies.verifyImage || (await dependencies.verifyImage(savedFilePath)).status !== 'available') {
          return { ok: false, message: '图片保存后未通过本机读取和解码核验，尚未采用，请重试。' }
        }

        if (epoch !== currentImageOperationEpoch()) return { ok: false, message: '操作范围已变化，图片未采用。' }
        return {
          ok: true,
          message: '图片已保存到当前设备。',
          image: savedFilePath,
          ...(selected.mediaType
            ? { mediaType: selected.mediaType }
            : {})
        }
      } catch (error) {
        return {
          ok: false,
          message: isCancelError(error)
            ? '已取消选择图片。'
            : '图片选择或保存失败，请稍后重试。'
        }
      }
    },

    async remove(image) {
      const filePath = String(image || '').trim()
      if (!filePath) return false

      try {
        await dependencies.removeSavedFile(filePath)
        return true
      } catch (error) {
        return false
      }
    }
  }
}
