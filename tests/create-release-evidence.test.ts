import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildArtifactInventory,
  parseSafeProductionSettings
} from '../scripts/create-release-evidence.mjs'

const tempRoots: string[] = []

afterEach(() => {
  tempRoots.splice(0).forEach(root =>
    rmSync(root, { recursive: true, force: true })
  )
})

describe('release evidence', () => {
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

  it('requires the actual WeChat app manifest', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wechat-release-missing-'))
    tempRoots.push(root)
    expect(() => buildArtifactInventory(root)).toThrow(
      'Wechat dist/app.json is missing'
    )
  })
})
