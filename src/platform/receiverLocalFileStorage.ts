import { createVerifiedScopedLocalStorage, type ScopedDependencies } from './verifiedScopedLocalStorage'

export const RECEIVER_LOCAL_KEYS = [
  'cboard_communication_receiver_records', 'cboard_communication_receiver_resume_record',
  'cboard_communication_receiver_corrections', 'cboard_communication_phrase_preparation',
  'cboard_communication_active_session'
] as const
export const RECEIVER_LOCAL_CLEAR_FILE = 'picinterpreter-receiver-local-cleared-v1.json'
export const isReceiverLocalFileName = (name: string) =>
  /^picinterpreter-receiver-local-([a-f0-9]{64}|cleared-v1)\.json(?:\.tmp)?$/.test(name)

export function createReceiverLocalFileStorage(dependencies: Omit<ScopedDependencies, 'definition'>) {
  return createVerifiedScopedLocalStorage({ ...dependencies, definition: {
    prefix: 'picinterpreter-receiver-local-', keys: RECEIVER_LOCAL_KEYS,
    normalizeValue(key, value) {
      if (value === undefined || value === null || value === '') return null
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      if (key === RECEIVER_LOCAL_KEYS[1]) return text
      const parsed = JSON.parse(text)
      const valid = key === RECEIVER_LOCAL_KEYS[0] || key === RECEIVER_LOCAL_KEYS[2]
        ? Array.isArray(parsed)
        : parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      if (!valid) throw new Error('接收或准备草稿格式不可读取，原数据已保留。')
      return text
    }
  } })
}
