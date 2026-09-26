import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildArtifactInventory,
  assertCleanWorkingTree,
  inspectBuiltFeatureManifest,
  parseSafeProductionSettings,
  RELEASE_CAPABILITY_KEYS,
  runGit
} from '../scripts/create-release-evidence.mjs'
import { buildArtifactFingerprint } from '../scripts/build-feature-manifest.mjs'

const tempRoots: string[] = []

afterEach(() => {
  tempRoots.splice(0).forEach(root =>
    rmSync(root, { recursive: true, force: true })
  )
})

describe('release evidence', () => {
  function writeFeatureManifest(root: string, overrides: Record<string, unknown> = {}) {
    const manifest = {
      schema: 1,
      marker: 'cboard-release-feature-manifest-v1',
      sourceRevision: 'revision-1',
      releaseChannel: 'production',
      cloudFeatures: false,
      aiFeatures: false,
      ocr: false,
      onlinePictograms: false,
      dialectAsr: false,
      careCollaboration: false,
      accountClosure: false,
      publicTrial: false,
      ...overrides
    }
    manifest.artifactFingerprint = buildArtifactFingerprint(root)
    writeFileSync(path.join(root, 'release-feature-manifest.json'), JSON.stringify(manifest))
  }

  it('creates deterministic per-file and per-package evidence', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wechat-release-evidence-'))
    tempRoots.push(root)
    mkdirSync(path.join(root, 'packages/caregiver'), { recursive: true })
    writeFileSync(
      path.join(root, 'app.json'),
      JSON.stringify({
        pages: ['pages/index/index'],
        subPackages: [{ root: 'packages/caregiver', pages: ['index'] }]
      })
    )
    writeFileSync(path.join(root, 'app.js'), 'main')
    writeFileSync(path.join(root, 'packages/caregiver/index.js'), 'caregiver')

    const first = buildArtifactInventory(root)
    const second = buildArtifactInventory(root)

    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.fileCount).toBe(3)
    expect(first.packages.main.fileCount).toBe(2)
    expect(first.packages['packages/caregiver/'].fileCount).toBe(1)
    expect(first.files.every(file => file.sha256.length === 64)).toBe(true)
  })

  it('records only whitelisted non-sensitive production settings', () => {
    expect(
      parseSafeProductionSettings(`
TARO_APP_RELEASE_CHANNEL=production
TARO_APP_ENABLE_AI_FEATURES=false
TARO_APP_API_BASE_URL=https://secret.example
APP_SECRET=must-not-appear
`)
    ).toEqual({
      TARO_APP_RELEASE_CHANNEL: 'production',
      TARO_APP_ENABLE_AI_FEATURES: 'false'
    })
  })

  it('uses the built manifest capabilities even when the env file disagrees', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wechat-release-manifest-'))
    tempRoots.push(root)
    writeFileSync(path.join(root, 'app.json'), '{}')
    writeFileSync(path.join(root, 'app.js'), 'built')
    writeFeatureManifest(root, { cloudFeatures: true, aiFeatures: true })
    const envFileSettings = parseSafeProductionSettings('TARO_APP_ENABLE_CLOUD_FEATURES=false\nTARO_APP_ENABLE_AI_FEATURES=false')
    const inspected = inspectBuiltFeatureManifest(root, 'revision-1')

    expect(RELEASE_CAPABILITY_KEYS).toHaveLength(9)
    expect(inspected.valid).toBe(true)
    expect(inspected.capabilities).toMatchObject({ cloudFeatures: true, aiFeatures: true })
    expect(envFileSettings).toMatchObject({
      TARO_APP_ENABLE_CLOUD_FEATURES: 'false',
      TARO_APP_ENABLE_AI_FEATURES: 'false'
    })
  })

  it('rejects manifest fingerprint and source revision mismatches', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wechat-release-invalid-manifest-'))
    tempRoots.push(root)
    writeFileSync(path.join(root, 'app.json'), '{}')
    writeFileSync(path.join(root, 'app.js'), 'built')
    writeFeatureManifest(root)
    writeFileSync(path.join(root, 'app.js'), 'changed after manifest')

    const inspected = inspectBuiltFeatureManifest(root, 'another-revision')
    expect(inspected.valid).toBe(false)
    expect(inspected.reasons.join(' ')).toContain('fingerprint')
    expect(inspected.reasons.join(' ')).toContain('source revision')
  })

  it('rejects untracked working tree entries in require-clean mode', () => {
    expect(() => assertCleanWorkingTree('?? new-file.ts\n', true)).toThrow('untracked source changes')
    expect(() => assertCleanWorkingTree(' M tracked-file.ts\n', true)).toThrow('untracked source changes')
    expect(() => assertCleanWorkingTree('', true)).not.toThrow()
    expect(() => assertCleanWorkingTree('?? local-note.txt\n', false)).not.toThrow()
  })

  it('requires the actual WeChat app manifest', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wechat-release-missing-'))
    tempRoots.push(root)
    expect(() => buildArtifactInventory(root)).toThrow(
      'Wechat dist/app.json is missing'
    )
  })

  it('reports a bounded diagnostic when git cannot start', () => {
    expect(() =>
      runGit(['status'], () => ({
        error: new Error('spawn EPERM')
      }))
    ).toThrow('git status failed to start: spawn EPERM')
  })

  it('does not assume stderr exists after a failed git command', () => {
    expect(() =>
      runGit(['status'], () => ({
        status: 1,
        stdout: undefined,
        stderr: undefined
      }))
    ).toThrow('git status failed: unknown git error')
  })
})
