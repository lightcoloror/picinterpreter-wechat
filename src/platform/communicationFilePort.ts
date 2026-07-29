export interface CommunicationFileResult<T = undefined> {
  ok: boolean
  message: string
  value?: T
}

export interface CommunicationFilePort {
  exportText(fileName: string, text: string): Promise<CommunicationFileResult<string>>
  importText(extensions?: string[]): Promise<CommunicationFileResult<string>>
}

interface CommunicationFileDependencies {
  chooseFile(extensions: string[]): Promise<{ name: string; path: string } | null>
  readText(path: string): Promise<string>
  writeText(fileName: string, text: string): Promise<string>
  openFile(path: string): Promise<void>
}

function normalizeFileName(value: string) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 120)
}

export function createCommunicationFilePort(
  dependencies: CommunicationFileDependencies
): CommunicationFilePort {
  return {
    async exportText(fileName, text) {
      const safeName = normalizeFileName(fileName)
      const content = String(text || '')
      if (!safeName || !content) {
        return { ok: false, message: '没有可导出的内容。' }
      }

      try {
        const path = await dependencies.writeText(safeName, content)
        await dependencies.openFile(path)
        return {
          ok: true,
          message: '导出文件已打开，可从右上角转发或保存。',
          value: path
        }
      } catch (error) {
        return { ok: false, message: '导出失败，请稍后重试。' }
      }
    },

    async importText(extensions = ['json']) {
      try {
        const selected = await dependencies.chooseFile(extensions)
        if (!selected) {
          return { ok: false, message: '未选择文件。' }
        }
        const text = await dependencies.readText(selected.path)
        if (!text.trim()) {
          return { ok: false, message: '所选文件是空的。' }
        }
        return {
          ok: true,
          message: `已读取「${selected.name}」。`,
          value: text
        }
      } catch (error) {
        return { ok: false, message: '读取文件失败，请选择有效的 JSON 文件。' }
      }
    }
  }
}
