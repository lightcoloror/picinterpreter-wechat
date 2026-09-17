import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { fromByteArray, toByteArray } from 'base64-js'

/** Same temporary-file replacement used by Care storage, with binary recovery support. */
export function createAccountClosureFileStorage(files: {
  root: string
  read(path: string): string | null
  write(path: string, text: string): void
  rename(from: string, to: string): void
}) {
  const pathFor = (key: string) => `${files.root}/closure-${bytesToHex(sha256(key))}.json`
  return {
    async get(key: string) {
      const text = files.read(pathFor(key))
      if (text === null) return null
      const envelope = JSON.parse(text)
      if (!envelope || envelope.version !== 1 || !['json', 'bytes'].includes(envelope.kind) || !Object.prototype.hasOwnProperty.call(envelope, 'value')) {
        throw new Error('本机注销恢复记录格式无效。')
      }
      if (envelope.kind === 'json') return envelope.value
      const record = envelope.value
      if (!record || typeof record.bytes !== 'string') throw new Error('本机恢复文件格式无效。')
      const bytes = toByteArray(record.bytes)
      if (fromByteArray(bytes) !== record.bytes) throw new Error('本机恢复文件编码损坏。')
      return { ...record, bytes }
    },
    async set(key: string, value: any) {
      const binary = value?.bytes instanceof Uint8Array
      const text = JSON.stringify({ version: 1, kind: binary ? 'bytes' : 'json',
        value: binary ? { ...value, bytes: fromByteArray(value.bytes) } : value })
      const path = pathFor(key)
      files.write(`${path}.tmp`, text)
      files.rename(`${path}.tmp`, path)
    }
  }
}
