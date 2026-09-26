import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  buildArtifactFingerprint,
  readBuiltFeatureManifest
} from './build-feature-manifest.mjs'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

export const RELEASE_CAPABILITY_KEYS = [
  'releaseChannel', 'cloudFeatures', 'aiFeatures', 'ocr',
  'onlinePictograms', 'dialectAsr', 'careCollaboration',
  'accountClosure', 'publicTrial'
]

export function inspectBuiltFeatureManifest(distRoot, sourceRevision) {
  const manifest = readBuiltFeatureManifest(distRoot)
  const reasons = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      complete: false,
      valid: false,
      capabilities: null,
      reasons: ['Built feature manifest is missing or invalid JSON.']
    }
  }
  const complete = manifest.schema === 1 &&
    manifest.marker === 'cboard-release-feature-manifest-v1' &&
    ['development', 'preview', 'production'].includes(manifest.releaseChannel) &&
    RELEASE_CAPABILITY_KEYS.slice(1).every(key => typeof manifest[key] === 'boolean')
  if (!complete) reasons.push('Built feature manifest is incomplete or has an unsupported schema.')
  const fingerprint = buildArtifactFingerprint(distRoot)
  if (typeof manifest.artifactFingerprint !== 'string' || manifest.artifactFingerprint !== fingerprint) {
    reasons.push('Built feature manifest artifact fingerprint does not match the dist contents.')
  }
  if (!sourceRevision || manifest.sourceRevision !== sourceRevision) {
    reasons.push('Built feature manifest source revision does not match the current source revision.')
  }
  const capabilities = complete
    ? Object.fromEntries(RELEASE_CAPABILITY_KEYS.map(key => [key, manifest[key]]))
    : null
  return {
    complete,
    valid: complete && reasons.length === 0,
    capabilities,
    reasons,
    schema: manifest.schema,
    marker: manifest.marker,
    sourceRevision: manifest.sourceRevision,
    artifactFingerprint: manifest.artifactFingerprint
  }
}

export function assertCleanWorkingTree(statusOutput, requireClean) {
  if (requireClean && statusOutput) {
    throw new Error(
      'Tracked or untracked source changes are present. Refusing formal release evidence.'
    )
  }
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

export function collectFiles(root, relative = '') {
  const current = path.join(root, relative)
  return readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap(entry => {
      const child = path.join(relative, entry.name)
      return entry.isDirectory() ? collectFiles(root, child) : [child]
    })
}

export function buildArtifactInventory(distRoot) {
  if (!existsSync(path.join(distRoot, 'app.json'))) {
    throw new Error('Wechat dist/app.json is missing. Run the production build first.')
  }

  const app = JSON.parse(readFileSync(path.join(distRoot, 'app.json'), 'utf8'))
  const packageRoots = (app.subPackages || app.subpackages || []).map(
    item => `${String(item.root || '').replace(/\\/g, '/').replace(/\/+$/, '')}/`
  )
  const files = collectFiles(distRoot).map(relativePath => {
    const normalized = relativePath.replace(/\\/g, '/')
    const contents = readFileSync(path.join(distRoot, relativePath))
    const packageRoot =
      packageRoots.find(root => normalized.startsWith(root)) || 'main'
    return {
      path: normalized,
      bytes: contents.byteLength,
      sha256: sha256(contents),
      package: packageRoot
    }
  })
  const packages = files.reduce((summary, file) => {
    const current = summary[file.package] || { bytes: 0, fileCount: 0 }
    current.bytes += file.bytes
    current.fileCount += 1
    summary[file.package] = current
    return summary
  }, {})
  const fingerprint = sha256(
    files.map(file => `${file.path}\0${file.sha256}\n`).join('')
  )

  return {
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    packages,
    fingerprint,
    files
  }
}

export function runGit(args, spawn = spawnSync) {
  const result = spawn('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) {
    throw new Error(
      `git ${args.join(' ')} failed to start: ${result.error.message}`
    )
  }
  if (result.status !== 0) {
    const details = String(
      result.stderr || result.stdout || 'unknown git error'
    ).trim()
    throw new Error(`git ${args.join(' ')} failed: ${details}`)
  }
  return String(result.stdout || '').trim()
}

export function parseSafeProductionSettings(source) {
  const allowed = new Set([
    'TARO_APP_RELEASE_CHANNEL',
    'TARO_APP_ENABLE_CLOUD_FEATURES',
    'TARO_APP_ENABLE_AI_FEATURES',
    'TARO_APP_ENABLE_OCR',
    'TARO_APP_ENABLE_ONLINE_PICTOGRAMS',
    'TARO_APP_ENABLE_DIALECT_ASR',
    'TARO_APP_WECHAT_SI_ENABLED',
    'TARO_APP_WECHAT_SI_VERSION'
  ])
  return source.split(/\r?\n/).reduce((settings, line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return settings
    const separator = trimmed.indexOf('=')
    if (separator < 1) return settings
    const key = trimmed.slice(0, separator).trim()
    if (allowed.has(key)) {
      settings[key] = trimmed.slice(separator + 1).trim()
    }
    return settings
  }, {})
}

function sanitizeRemote(remote) {
  try {
    const url = new URL(remote)
    url.username = ''
    url.password = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return remote.replace(/\/\/[^/@]+@/, '//')
  }
}

export function run(args = process.argv.slice(2)) {
  const trackedStatus = runGit(['status', '--porcelain', '--untracked-files=no'])
  // Directory-level untracked entries are sufficient to reject a dirty tree;
  // expanding every cached build asset can overflow child_process buffers.
  const fullStatus = runGit(['status', '--porcelain', '--untracked-files=normal'])
  assertCleanWorkingTree(fullStatus, args.includes('--require-clean'))

  const distArgumentIndex = args.indexOf('--dist')
  const distRoot = distArgumentIndex >= 0
    ? path.resolve(projectRoot, args[distArgumentIndex + 1] || '')
    : path.join(projectRoot, 'dist')
  const inventory = buildArtifactInventory(distRoot)
  const commit = runGit(['rev-parse', 'HEAD'])
  const featureManifest = inspectBuiltFeatureManifest(distRoot, commit)
  if (args.includes('--require-clean') && !featureManifest.valid) {
    throw new Error(`Formal release evidence requires a complete valid built feature manifest: ${featureManifest.reasons.join(' ')}`)
  }
  const shortCommit = commit.slice(0, 12)
  const generatedAt = new Date().toISOString()
  const evidence = {
    version: 1,
    generatedAt,
    intent: '证明待上传微信代码包与可获取源码提交、生产功能开关和实际文件内容一一对应。',
    decision:
      '仅记录白名单非敏感配置；使用逐文件 SHA-256 和整体指纹，不记录 AppSecret、API 密钥或用户数据。',
    reason: '构建成功不能证明上传包来自哪一提交，也不能证明联网能力是否关闭。',
    source: {
      commit,
      remote: sanitizeRemote(runGit(['remote', 'get-url', 'origin'])),
      trackedChangesPresent: Boolean(trackedStatus),
      untrackedChangesPresent: Boolean(fullStatus && fullStatus !== trackedStatus)
    },
    featureManifest,
    formalEvidenceEligible: featureManifest.valid && !fullStatus,
    formalEvidenceLimitations: featureManifest.valid
      ? (fullStatus ? ['Source working tree has tracked or untracked changes.'] : [])
      : featureManifest.reasons,
    artifact: inventory,
    effectiveScope: '当前 dist 微信小程序代码包；不代表微信审核、备案、许可或真机验收通过。'
  }
  const outputRoot = path.join(projectRoot, '.release-evidence')
  mkdirSync(outputRoot, { recursive: true })
  const timestamp = generatedAt.replace(/[:.]/g, '-')
  const outputPath = path.join(
    outputRoot,
    `${timestamp}-${shortCommit}.json`
  )
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(
    `Release evidence created: ${outputPath} (${inventory.fileCount} files, ${inventory.totalBytes} bytes, ${inventory.fingerprint}).`
  )
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase()

if (isMain) run()
