export interface LocalDeviceDataPortResult {
  ok: boolean
  message: string
}

export interface LocalDeviceDataPort {
  removePrivateFile(filePath: string): Promise<boolean>
  clearAllLocalData(): Promise<LocalDeviceDataPortResult>
}

interface LocalDeviceDataPortDependencies {
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
      try {
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
