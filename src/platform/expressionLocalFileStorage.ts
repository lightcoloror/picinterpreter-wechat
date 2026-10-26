import type { LocalTextFileSystem } from './verifiedLocalTextFile'
import { createVerifiedScopedLocalStorage } from './verifiedScopedLocalStorage'

// One authoritative file for a scope, not a second copy chosen by a KV pointer.
// History shares the draft boundary: a confirmed marker cannot outlive its history write.
export const EXPRESSION_LOCAL_KEYS = [
  'cboard_communication_expression_draft_v1',
  'cboard_communication_history',
  'cboard_tuyujia_history',
  'cboard_communication_patient_id',
  'cboard_communication_workspace_id'
] as const
type ExpressionLocalKey = typeof EXPRESSION_LOCAL_KEYS[number]
const FILE_PREFIX = 'picinterpreter-expression-local-'
export const EXPRESSION_LOCAL_CLEAR_FILE = `${FILE_PREFIX}cleared-v1.json`
const ownedFile = /^picinterpreter-expression-local-([a-f0-9]{64})\.json(?:\.tmp)?$/
export const isExpressionLocalFileName = (name: string) =>
  ownedFile.test(name) || name === EXPRESSION_LOCAL_CLEAR_FILE || name === `${EXPRESSION_LOCAL_CLEAR_FILE}.tmp`

interface Dependencies {
  rootPath: string
  files: LocalTextFileSystem & { readdirSync(path: string): string[] }
  legacy: { getStorageSync(key: string): unknown }
  getScopeKey(): string
  newGeneration?: () => string
}
const fail = (message: string) => Object.assign(new Error(message), { code: 'EXPRESSION_DRAFT_STORAGE_FAILED' })

function normalizeValue(key: ExpressionLocalKey, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (typeof text !== 'string') throw fail('本机表达内容不可读取，原数据已保留。')
  if (key === EXPRESSION_LOCAL_KEYS[0]) {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail('本机表达草稿格式无效。')
  } else if (key === EXPRESSION_LOCAL_KEYS[1] || key === EXPRESSION_LOCAL_KEYS[2]) {
    if (!Array.isArray(JSON.parse(text))) throw fail('本机表达历史格式无效。')
  }
  return text
}

export function createExpressionLocalFileStorage(dependencies: Dependencies) {
  return createVerifiedScopedLocalStorage({ ...dependencies, definition: {
    prefix: FILE_PREFIX, keys: EXPRESSION_LOCAL_KEYS,
    normalizeValue: (key, value) => normalizeValue(key as ExpressionLocalKey, value)
  } })
}
