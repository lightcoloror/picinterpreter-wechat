import { describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
  evaluateReleaseReadiness,
  hasSourceChanges
} from '../scripts/release-readiness.mjs'

const completeConfig = {
  formalAccountConfirmed: true,
  serviceCategory: '工具 / 健康管理（以平台审核结果为准）',
  filingNumber: '示例备案编号',
  privacyGuideConfirmed: true,
  wechatSiAuthorized: true,
  apiBaseUrl: 'https://api.picinterpreter.example.cn',
  apiRequestDomainConfigured: true,
  apiUploadDomainConfigured: true,
  apiDownloadDomainConfigured: true,
  arasaacRequestDomainConfigured: true,
  arasaacDownloadDomainConfigured: true,
  sourceCodeUrl: 'https://github.com/picinterpreter/picinterpreter-wechat',
  sourceCodePubliclyAccessibleConfirmed: true,
  bundledSymbolLicensesReviewed: true,
  cboardSymbolsResolved: true,
  commercialUse: false,
  arasaacCommercialUseResolved: false,
  coreRealDeviceAcceptanceConfirmed: true,
  realDeviceAcceptanceConfirmed: true,
  performanceScanConfirmed: true,
  publicTrial: false
}

const enabledManifest = {
  schema: 1,
  marker: 'cboard-release-feature-manifest-v1',
  sourceRevision: 'test-revision',
  careCollaboration: true,
  cloudFeatures: true,
  aiFeatures: true,
  ocr: true,
  onlinePictograms: true,
  dialectAsr: true,
  accountClosure: true,
  publicTrial: true
}

describe('formal release readiness gate', () => {
  const offlineManifest = {
    ...enabledManifest,
    releaseChannel: 'production', apiBaseUrl: '',
    cloudFeatures: false, aiFeatures: false, ocr: false,
    onlinePictograms: false, dialectAsr: false,
    careCollaboration: false, accountClosure: false, publicTrial: false
  }
  const offlineConfig = {
    ...completeConfig, apiBaseUrl: '',
    apiRequestDomainConfigured: false, apiUploadDomainConfigured: false,
    apiDownloadDomainConfigured: false, arasaacRequestDomainConfigured: false,
    arasaacDownloadDomainConfigured: false, realDeviceAcceptanceConfirmed: false
  }
  test('an offline artifact keeps filing, privacy, licensing and core acceptance gates but needs no unused API domains', () => {
    expect(evaluateReleaseReadiness(offlineConfig, offlineManifest)).toEqual({ ready: true, issues: [] })
    expect(evaluateReleaseReadiness({ ...offlineConfig, privacyGuideConfirmed: false }, offlineManifest).ready).toBe(false)
    expect(evaluateReleaseReadiness({ ...offlineConfig, coreRealDeviceAcceptanceConfirmed: false }, offlineManifest).ready).toBe(false)
    expect(evaluateReleaseReadiness({ ...offlineConfig, filingNumber: '' }, offlineManifest).ready).toBe(false)
  })
  test.each(['cloudFeatures', 'aiFeatures', 'ocr', 'dialectAsr'])('requires the configured API and network acceptance when %s is present in the artifact', field => {
    const result = evaluateReleaseReadiness(offlineConfig, { ...offlineManifest, [field]: true })
    expect(result.issues).toContain('正式 cboard-api 必须使用公众可访问的 HTTPS 域名。')
    expect(result.issues).toContain('尚未完成正式后端、真实账号和真实网络下的手机验收。')
  })
  test('requires only direct pictogram domains when online pictograms run without an API', () => {
    const result = evaluateReleaseReadiness(offlineConfig, { ...offlineManifest, onlinePictograms: true })
    expect(result.issues).toContain('尚未配置 https://api.arasaac.org 为 request 合法域名。')
    expect(result.issues).not.toContain('正式 cboard-api 必须使用公众可访问的 HTTPS 域名。')
  })
  test('an absent or incomplete manifest cannot waive API prerequisites', () => {
    for (const manifest of [null, { ...offlineManifest, aiFeatures: undefined }, { ...offlineManifest, cloudFeatures: 'false' }]) {
      const result = evaluateReleaseReadiness(offlineConfig, manifest)
      expect(result.ready).toBe(false)
      expect(result.issues).toContain('正式代码包缺少完整可核验的功能开关 manifest，请重新构建。')
      expect(result.issues).toContain('正式 cboard-api 必须使用公众可访问的 HTTPS 域名。')
    }
  })
  test('all formal builds need the production channel, and any network build must match its configured endpoint', () => {
    expect(evaluateReleaseReadiness(offlineConfig, { ...offlineManifest, releaseChannel: 'preview' }).ready).toBe(false)
    const result = evaluateReleaseReadiness(completeConfig, {
      ...offlineManifest, cloudFeatures: true, apiBaseUrl: 'https://different.example.cn'
    })
    expect(result.issues).toContain('联网构建 API endpoint 必须有效且与 readiness 配置一致。')
  })
  test.each(['https://api.example.cn/api?key=value', 'https://api.example.cn/api#path'])('rejects API bases whose query or fragment would swallow appended endpoints: %s', apiBaseUrl => {
    const result = evaluateReleaseReadiness({ ...completeConfig, apiBaseUrl }, {
      ...offlineManifest, cloudFeatures: true, apiBaseUrl
    })
    expect(result.issues).toContain('正式 cboard-api 必须使用公众可访问的 HTTPS 域名。')
  })
  test.each([
    'https://192.168.1.20', 'https://10.0.0.1', 'https://172.16.0.1',
    'https://127.1', 'https://[::1]', 'https://[::ffff:127.0.0.1]',
    'https://api.localhost', 'https://api.local.', 'https://api.test',
    'https://api.internal', 'https://server', 'https://router.home.arpa',
    'https://user:secret@api.example.cn'
  ])('rejects development or credential-bearing endpoints: %s', endpoint => {
    const result = evaluateReleaseReadiness({
      ...completeConfig, apiBaseUrl: endpoint, sourceCodeUrl: endpoint
    })
    expect(result.issues).toContain('正式 cboard-api 必须使用公众可访问的 HTTPS 域名。')
    expect(result.issues).toContain('GPLv3 对应源码地址必须是公众可访问的 HTTPS 地址。')
  })
  test.each([false, undefined])('blocks public trial without verified closure UI flag: %s', accountClosure => {
    const result = evaluateReleaseReadiness({ ...completeConfig, publicTrial: true }, {
      ...enabledManifest, accountClosure,
      releaseChannel: 'production', apiBaseUrl: completeConfig.apiBaseUrl
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toContain('public-trial 构建必须启用账号注销确认流程。')
  })
  test('passes a reviewed non-commercial release', () => {
    expect(evaluateReleaseReadiness({ ...completeConfig, publicTrial: true }, {
      ...enabledManifest, releaseChannel: 'production', apiBaseUrl: completeConfig.apiBaseUrl
    })).toEqual({
      ready: true,
      issues: []
    })
  })

  test('rejects private-development placeholders and missing reviews', () => {
    const result = evaluateReleaseReadiness({
      ...completeConfig,
      apiBaseUrl: 'http://localhost:3001',
      sourceCodeUrl: '',
      privacyGuideConfirmed: false,
      cboardSymbolsResolved: false
    })

    expect(result.ready).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        '公众平台用户隐私保护指引尚未与代码权限逐项核对。',
        '正式 cboard-api 必须使用公众可访问的 HTTPS 域名。',
        'GPLv3 对应源码地址必须是公众可访问的 HTTPS 地址。',
        '17 张 CBoard 自有图符的逐图许可尚未确认或替换。'
      ])
    )
  })

  test('adds the ARASAAC blocker only for commercial use', () => {
    const result = evaluateReleaseReadiness({
      ...completeConfig,
      commercialUse: true
    })

    expect(result.issues).toContain(
      '商业使用版本尚未取得 ARASAAC 商业许可或替换非商业图符。'
    )
  })

  test('keeps core and full real-device acceptance as separate gates', () => {
    const missingCore = evaluateReleaseReadiness({
      ...completeConfig,
      coreRealDeviceAcceptanceConfirmed: false
    })
    expect(missingCore.issues).toContain(
      '尚未完成正式 AppID 下的双向沟通核心真机验收。'
    )

    const missingFullAcceptance = evaluateReleaseReadiness({
      ...completeConfig,
      realDeviceAcceptanceConfirmed: false
    })
    expect(missingFullAcceptance.issues).not.toContain(
      '尚未完成正式 AppID 下的双向沟通核心真机验收。'
    )
    expect(missingFullAcceptance.issues).toContain(
      '尚未完成正式后端、真实账号和真实网络下的手机验收。'
    )
  })

  test('blocks a public-trial build when collaboration or cloud flags are absent', () => {
    const result = evaluateReleaseReadiness({ ...completeConfig, publicTrial: true }, {
      ...enabledManifest,
      releaseChannel: 'production',
      apiBaseUrl: completeConfig.apiBaseUrl,
      careCollaboration: false,
      cloudFeatures: false
    })
    expect(result.issues).toEqual(expect.arrayContaining([
      'public-trial 构建必须启用家庭协作开关。',
      'public-trial 构建必须启用云功能开关。'
    ]))
  })

  test('does not require collaboration for a non-trial build', () => {
    expect(evaluateReleaseReadiness(completeConfig, {
      ...enabledManifest,
      careCollaboration: false,
      cloudFeatures: false,
      publicTrial: false
    }).issues).not.toContain('public-trial 构建必须启用家庭协作开关。')
  })

  test('blocks public-trial when the artifact manifest is missing', () => {
    const result = evaluateReleaseReadiness({ ...completeConfig, publicTrial: true }, null)
    expect(result.issues).toContain('public-trial readiness 要求产物启用 public-trial 开关。')
  })

  test('detects changed dist files with the persisted fingerprint helper', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cboard-release-'))
    try {
      mkdirSync(path.join(root, 'pages'))
      writeFileSync(path.join(root, 'app.js'), 'one')
      writeFileSync(path.join(root, 'pages', 'index.js'), 'two')
      const { buildArtifactFingerprint } = await import('../scripts/build-feature-manifest.mjs')
      const first = buildArtifactFingerprint(root)
      writeFileSync(path.join(root, 'app.js'), 'changed')
      expect(buildArtifactFingerprint(root)).not.toBe(first)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('blocks untracked, staged and modified source while accepting a clean checkout', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cboard-source-gate-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
    try {
      git('init')
      writeFileSync(path.join(root, '.gitignore'), 'cache/\n')
      git('add', '.gitignore')
      git('-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '-m', 'synthetic fixture')
      expect(hasSourceChanges(root)).toBe(false)
      mkdirSync(path.join(root, 'cache'))
      writeFileSync(path.join(root, 'cache', 'ignored.txt'), 'cache')
      expect(hasSourceChanges(root)).toBe(false)
      writeFileSync(path.join(root, 'new-source.ts'), 'export const enabled = true')
      expect(hasSourceChanges(root)).toBe(true)
      git('add', 'new-source.ts')
      expect(hasSourceChanges(root)).toBe(true)
      git('-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '-m', 'synthetic source')
      expect(hasSourceChanges(root)).toBe(false)
      writeFileSync(path.join(root, 'new-source.ts'), 'export const enabled = false')
      expect(hasSourceChanges(root)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
