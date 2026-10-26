/** Care/closure temporary-file replacement with explicit file read-back.
 * This verifies the platform's local file write; it does not promise power-loss fsync.
 */
export interface LocalTextFileSystem {
  readFileSync(path: string, encoding?: 'utf8'): string | ArrayBuffer
  writeFileSync(path: string, value: string, encoding?: 'utf8'): void
  renameSync(from: string, to: string): void
}

export function readOptionalLocalTextFile(files: LocalTextFileSystem, path: string): string | null {
  try {
    const value = files.readFileSync(path, 'utf8')
    if (typeof value !== 'string') throw new Error('本机文件读取格式不正确。')
    return value
  } catch (error: any) {
    const message = String(error?.errMsg || error?.message || '').toLowerCase()
    // The IDE uses this exact readFileSync error for a new USER_DATA_PATH file.
    // Match the requested path too; unrelated "not found"/permission errors stay fatal.
    if (message === `readfilesync:fail ${path.toLowerCase()} not found`) return null
    if (error?.code === 'ENOENT' || message.includes('no such file') || message.includes('not exist')) return null
    throw error
  }
}

export function writeVerifiedLocalTextFile(files: LocalTextFileSystem, path: string, text: string): void {
  const temporary = `${path}.tmp`
  files.writeFileSync(temporary, text, 'utf8')
  if (readOptionalLocalTextFile(files, temporary) !== text) throw new Error('本机临时文件未能完整保存。')
  files.renameSync(temporary, path)
  if (readOptionalLocalTextFile(files, path) !== text) throw new Error('本机文件保存后核对失败。')
}
