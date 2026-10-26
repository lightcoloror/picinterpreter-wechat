import { clearSavedPhraseUndoSession } from '@cboard-communication-core/savedPhraseUse'
import { invalidateImageOperations } from '@cboard-communication-core/imageOperationEpoch'

export interface LocalDeviceDataPortResult {
  ok: boolean
  message: string
}

export interface LocalDeviceDataPort {
  removePrivateFile(filePath: string): Promise<boolean>
  clearAllLocalData(): Promise<LocalDeviceDataPortResult>
}

interface LocalDeviceDataPortDependencies {
  clearExpressionState?(): Promise<void>
  removeFile(filePath: string): Promise<void>
  listSavedFiles(): Promise<string[]>
  listGeneratedFiles(): Promise<string[]>
  removePictureLibraryRoot(): Promise<void>
  clearStorage(): Promise<void>
}

export function isGeneratedLocalDataFileName(fileName: string) {
  const name = String(fileName || '').trim()
  return (
    /^picinterpreter-.*\.(zip|json|txt)$/i.test(name) ||
    /^picinterpreter-tts-current\.mp3$/i.test(name) ||
    /^图语家_(对话记录|常用语)_.*\.(json|txt)$/u.test(name)
  )
}

export function createLocalDeviceDataPort(
  dependencies: LocalDeviceDataPortDependencies
): LocalDeviceDataPort {
  return {
    async removePrivateFile(filePath) {
      const normalized = String(filePath || '').trim()
      if (!normalized) return false
      try {
        await dependencies.removeFile(normalized)
        return true
      } catch (error) {
        return false
      }
    },

    async clearAllLocalData() {
      invalidateImageOperations()
      clearSavedPhraseUndoSession()
      try {
        // A verified empty file barrier must survive delayed legacy KV cleanup.
        await dependencies.clearExpressionState?.()
        const files = Array.from(
          new Set([
            ...(await dependencies.listSavedFiles()),
            ...(await dependencies.listGeneratedFiles())
          ])
        )
        for (const filePath of files) {
          await dependencies.removeFile(filePath)
        }
        await dependencies.removePictureLibraryRoot()
        await dependencies.clearStorage()
        return {
          ok: true,
          message: '本机图片、备份文件、沟通记录、设置和登录信息已清除。'
        }
      } catch (error) {
        return {
          ok: false,
          message: '本机数据未能完整清除，请不要交接设备，并重试。'
        }
      }
    }
  }
}
