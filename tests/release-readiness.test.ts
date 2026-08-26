import { describe, expect, test } from 'vitest'

import {
  evaluateReleaseReadiness
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
  performanceScanConfirmed: true
}

describe('formal release readiness gate', () => {
  test('passes a reviewed non-commercial release', () => {
    expect(evaluateReleaseReadiness(completeConfig)).toEqual({
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
})
