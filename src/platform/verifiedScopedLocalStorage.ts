import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { readOptionalLocalTextFile, writeVerifiedLocalTextFile, type LocalTextFileSystem } from './verifiedLocalTextFile'

export interface ScopedDependencies {
  rootPath: string
  files: LocalTextFileSystem & { readdirSync(path: string): string[] }
  legacy: { getStorageSync(key: string): unknown }
  getScopeKey(): string
  newGeneration?: () => string
  definition: { prefix: string; keys: readonly string[]; normalizeValue(key: string, value: unknown): string | null }
}
interface ScopedEnvelope {
  version: 1
  scopeHash: string
  generation: string | null
  values: Record<string, string | null>
}
const scopeDigest = (value: string) => bytesToHex(sha256(value))
const fail = (message: string) => Object.assign(new Error(message), { code: 'EXPRESSION_DRAFT_STORAGE_FAILED' })

export function createVerifiedScopedLocalStorage(dependencies: ScopedDependencies) {
  const { files, legacy, getScopeKey, definition } = dependencies
  const EXPRESSION_LOCAL_KEYS = definition.keys
  const FILE_PREFIX = definition.prefix
  const EXPRESSION_LOCAL_CLEAR_FILE = `${FILE_PREFIX}cleared-v1.json`
  const ownedFile = new RegExp(`^${FILE_PREFIX}([a-f0-9]{64})\\.json(?:\\.tmp)?$`)
  const emptyValues = () => Object.fromEntries(EXPRESSION_LOCAL_KEYS.map(key => [key, null])) as Record<string, string | null>
  const normalizeValue = definition.normalizeValue
  const root = String(dependencies.rootPath || '').trim().replace(/\/+$/, '')
  if (!root) throw fail('本机文件目录不可用，表达尚未可靠保存。')
  const pathForHash = (hash: string) => `${root}/${FILE_PREFIX}${hash}.json`
  const markerPath = `${root}/${EXPRESSION_LOCAL_CLEAR_FILE}`
  const current = () => {
    const scope = getScopeKey()
    if (!scope) throw fail('当前表达范围不可用。')
    return { scope, hash: scopeDigest(scope) }
  }
  const checkScope = (scope: string) => {
    if (scope !== getScopeKey()) throw fail('账号或档案已切换，旧表达不会写入新范围。')
  }
  const generation = () => {
    const raw = readOptionalLocalTextFile(files, markerPath)
    if (raw === null) return null
    const marker = JSON.parse(raw)
    if (marker?.version !== 1 || marker.denyLegacyMigration !== true || !/^[a-f0-9]{64}$/.test(marker.generation)) {
      throw fail('本机清理状态不可读取，未恢复旧数据。')
    }
    return marker.generation as string
  }
  const blank = (scopeHash: string, epoch: string | null): ScopedEnvelope =>
    ({ version: 1, scopeHash, generation: epoch, values: emptyValues() })
  const decode = (raw: string, scopeHash: string): ScopedEnvelope => {
    const record = JSON.parse(raw)
    if (record?.version !== 1 || record.scopeHash !== scopeHash || !record.values ||
        typeof record.values !== 'object' || Array.isArray(record.values) ||
        !(record.generation === null || /^[a-f0-9]{64}$/.test(record.generation)) ||
        Object.keys(record.values).length !== EXPRESSION_LOCAL_KEYS.length ||
        !EXPRESSION_LOCAL_KEYS.every(key => Object.prototype.hasOwnProperty.call(record.values, key))) {
      throw fail('本机表达文件损坏或属于其他范围，原文件已保留。')
    }
    const values = emptyValues()
    for (const key of EXPRESSION_LOCAL_KEYS) {
      const value = record.values[key]
      if (value !== null && typeof value !== 'string') throw fail('本机表达文件内容不可读取。')
      values[key] = normalizeValue(key, value)
    }
    return { version: 1, scopeHash, generation: record.generation, values }
  }
  const write = (record: ScopedEnvelope, scope?: string) => {
    if (scope) checkScope(scope)
    writeVerifiedLocalTextFile(files, pathForHash(record.scopeHash), JSON.stringify(record))
    if (scope) checkScope(scope)
  }
  const load = (captured = current()): ScopedEnvelope => {
    const epoch = generation()
    const raw = readOptionalLocalTextFile(files, pathForHash(captured.hash))
    if (raw !== null) {
      const record = decode(raw, captured.hash)
      if (record.generation === epoch) return record
      // A completed privacy barrier always outranks older files. No old KV fallback.
      const cleared = blank(captured.hash, epoch)
      write(cleared, captured.scope)
      return cleared
    }
    const record = blank(captured.hash, epoch)
    if (epoch === null) {
      // One-time, bounded migration only when this scope has never had a file.
      for (const key of EXPRESSION_LOCAL_KEYS) record.values[key] = normalizeValue(key, legacy.getStorageSync(key))
    }
    write(record, captured.scope)
    return record
  }
  const assertKey = (key: string): string => {
    if (!EXPRESSION_LOCAL_KEYS.includes(key as string)) throw fail('不支持的本机表达存储项。')
    return key as string
  }
  return {
    handles: (key: string) => EXPRESSION_LOCAL_KEYS.includes(key as string),
    getStorageSync(key: string) {
      const field = assertKey(key)
      return load().values[field]
    },
    setStorageSync(key: string, value: unknown) {
      const field = assertKey(key)
      const captured = current()
      const record = load(captured)
      record.values[field] = normalizeValue(field, value)
      write(record, captured.scope)
    },
    removeStorageSync(key: string) {
      const field = assertKey(key)
      const captured = current()
      const record = load(captured)
      record.values[field] = null
      write(record, captured.scope)
    },
    clearAllScopes() {
      // The non-sensitive generation blocks delayed old KV and older files,
      // including an interrupted cleanup. Never delete this barrier afterward.
      const next = dependencies.newGeneration?.() || scopeDigest(`${Date.now()}:${Math.random()}`)
      if (!/^[a-f0-9]{64}$/.test(next)) throw fail('清理状态无效。')
      writeVerifiedLocalTextFile(files, markerPath, JSON.stringify({
        version: 1, denyLegacyMigration: true, generation: next
      }))
      const hashes = new Set<string>()
      for (const name of files.readdirSync(root)) {
        const match = ownedFile.exec(name)
        if (match) hashes.add(match[1])
      }
      for (const hash of hashes) write(blank(hash, next))
    }
  }
}
