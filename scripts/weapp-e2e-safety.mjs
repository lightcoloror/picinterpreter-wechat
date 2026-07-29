import { createHash } from 'node:crypto'
import path from 'node:path'

export const STORAGE_RECOVERY_SCHEMA_VERSION = 1

function normalizeStorageEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('storage recovery entries must be an array')
  }

  const normalized = entries.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(`storage recovery entry ${index} must be a key/value pair`)
    }
    if (typeof entry[0] !== 'string' || !entry[0]) {
      throw new Error(`storage recovery entry ${index} must have a string key`)
    }
    return [entry[0], entry[1]]
  })

  if (new Set(normalized.map(([key]) => key)).size !== normalized.length) {
    throw new Error('storage recovery entries must have unique keys')
  }
  return normalized
}

function recoveryChecksum(document) {
  return createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex')
}

export function storageRecoveryPath(tempDirectory, projectPath) {
  const projectHash = createHash('sha256')
    .update(path.resolve(projectPath).toLowerCase())
    .digest('hex')
    .slice(0, 16)
  return path.join(
    tempDirectory,
    `storage-recovery-v${STORAGE_RECOVERY_SCHEMA_VERSION}-${projectHash}.json`
  )
}

export function createStorageRecoveryDocument({
  projectPath,
  entries,
  createdAt = new Date().toISOString()
}) {
  const document = {
    schemaVersion: STORAGE_RECOVERY_SCHEMA_VERSION,
    projectPath: path.resolve(projectPath),
    createdAt,
    entries: normalizeStorageEntries(entries)
  }
  return {
    ...document,
    checksum: recoveryChecksum(document)
  }
}

export function parseStorageRecoveryDocument(source, expectedProjectPath) {
  const parsed = JSON.parse(String(source))
  if (parsed?.schemaVersion !== STORAGE_RECOVERY_SCHEMA_VERSION) {
    throw new Error(
      `unsupported storage recovery schema: ${parsed?.schemaVersion}`
    )
  }

  const expectedPath = path.resolve(expectedProjectPath)
  if (path.resolve(String(parsed.projectPath || '')) !== expectedPath) {
    throw new Error('storage recovery belongs to a different project')
  }

  const document = {
    schemaVersion: parsed.schemaVersion,
    projectPath: expectedPath,
    createdAt: String(parsed.createdAt || ''),
    entries: normalizeStorageEntries(parsed.entries)
  }
  if (!document.createdAt) {
    throw new Error('storage recovery is missing its creation time')
  }
  if (parsed.checksum !== recoveryChecksum(document)) {
    throw new Error('storage recovery checksum does not match')
  }
  return document
}

function consoleEntryMessage(line) {
  try {
    const parsed = JSON.parse(line)
    if (Array.isArray(parsed)) return parsed.slice(1).join(' ')
  } catch {
    // Unstructured lines remain failures so the check cannot hide new errors.
  }
  return line
}

function isKnownDevToolsRouteRace(message) {
  const text = String(message).trim()
  if (/^routeDone with a webviewId \d+ is not found$/i.test(text)) {
    return true
  }
  return (
    text.includes('SystemError (appServiceSDKScriptError)') &&
    /\[Page route 错误\(system error\)\] routeDone with a webviewId \d+ is not found/i
      .test(text)
  )
}

export function unexpectedSimulatorConsoleErrors(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isKnownDevToolsRouteRace(consoleEntryMessage(line)))
    .join('\n')
}

export function isTransientWechatideTransportError(error) {
  const message = String(error?.message || error)
  return [
    'Client network socket disconnected before secure TLS connection was established',
    'ECONNRESET',
    'socket hang up',
    'connect ETIMEDOUT'
  ].some(fragment => message.includes(fragment))
}

export function isRetryableWechatideOperation(tool, options = {}) {
  if (
    tool === 'automation_runtime_info' ||
    tool === 'automation_page_action' ||
    tool === 'get_simulator_console' ||
    tool === 'simulator_screenshot'
  ) {
    return true
  }

  if (tool === 'automation_element_action') {
    return ['input', 'text', 'attribute', 'value', 'boundingBox']
      .includes(options.action)
  }

  if (tool === 'automation_wx_api' && options.action === 'call') {
    return [
      'getStorageInfoSync',
      'getStorageSync',
      'setStorageSync',
      'removeStorageSync'
    ].includes(options.method)
  }
  return false
}
