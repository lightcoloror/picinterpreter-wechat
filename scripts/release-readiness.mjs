import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_CONFIG = '.release-readiness.local.json'

function isHttpsPublicUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return (
      url.protocol === 'https:' &&
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1' &&
      !url.hostname.endsWith('.local') &&
      !url.hostname.endsWith('.test')
    )
  } catch {
    return false
  }
}

export function evaluateReleaseReadiness(config = {}) {
  const issues = []
  const requireTrue = (field, message) => {
    if (config[field] !== true) issues.push(message)
  }
  const requireText = (field, message) => {
    if (!String(config[field] || '').trim()) issues.push(message)
  }

  requireTrue(
    'formalAccountConfirmed',
    '尚未确认正式小程序账号、主体和管理员。'
  )
  requireText(
    'serviceCategory',
    '尚未记录与实际功能一致的微信服务类目。'
  )
  requireText('filingNumber', '尚未填写已获批的小程序备案编号。')
  requireTrue(
    'privacyGuideConfirmed',
    '公众平台用户隐私保护指引尚未与代码权限逐项核对。'
  )
  requireTrue(
    'wechatSiAuthorized',
    '尚未确认正式 AppID 已授权当前 WechatSI 插件版本。'
  )

  if (!isHttpsPublicUrl(config.apiBaseUrl)) {
    issues.push('正式 cboard-api 必须使用公众可访问的 HTTPS 域名。')
  }
  requireTrue(
    'apiRequestDomainConfigured',
    '尚未在公众平台配置 cboard-api request 合法域名。'
  )
  requireTrue(
    'apiUploadDomainConfigured',
    '尚未在公众平台配置 cboard-api uploadFile 合法域名。'
  )
  requireTrue(
    'apiDownloadDomainConfigured',
    '尚未在公众平台配置 cboard-api downloadFile 合法域名。'
  )
  requireTrue(
    'arasaacRequestDomainConfigured',
    '尚未配置 https://api.arasaac.org 为 request 合法域名。'
  )
  requireTrue(
    'arasaacDownloadDomainConfigured',
    '尚未配置 https://static.arasaac.org 为 downloadFile 合法域名。'
  )

  if (!isHttpsPublicUrl(config.sourceCodeUrl)) {
    issues.push('GPLv3 对应源码地址必须是公众可访问的 HTTPS 地址。')
  }
  requireTrue(
    'sourceCodePubliclyAccessibleConfirmed',
    '尚未从未登录窗口确认源码仓库可被公众访问。'
  )
  requireTrue(
    'bundledSymbolLicensesReviewed',
    '尚未逐项确认随包 Mulberry、ARASAAC 与 CBoard 图符许可。'
  )
  requireTrue(
    'cboardSymbolsResolved',
    '17 张 CBoard 自有图符的逐图许可尚未确认或替换。'
  )

  if (config.commercialUse === true) {
    requireTrue(
      'arasaacCommercialUseResolved',
      '商业使用版本尚未取得 ARASAAC 商业许可或替换非商业图符。'
    )
  }

  requireTrue(
    'coreRealDeviceAcceptanceConfirmed',
    '尚未完成正式 AppID 下的双向沟通核心真机验收。'
  )
  requireTrue(
    'realDeviceAcceptanceConfirmed',
    '尚未完成正式后端、真实账号和真实网络下的手机验收。'
  )
  requireTrue(
    'performanceScanConfirmed',
    '尚未完成微信开发者工具性能扫描和插件体积复核。'
  )

  return {
    ready: issues.length === 0,
    issues
  }
}

function parseConfigPath(argv) {
  const configIndex = argv.indexOf('--config')
  return configIndex >= 0 && argv[configIndex + 1]
    ? argv[configIndex + 1]
    : DEFAULT_CONFIG
}

function run() {
  const configPath = path.resolve(process.cwd(), parseConfigPath(process.argv))
  if (!existsSync(configPath)) {
    console.error(`Missing release readiness file: ${configPath}`)
    console.error(
      'Copy release-readiness.example.json to .release-readiness.local.json and replace every placeholder with reviewed evidence.'
    )
    process.exit(1)
  }

  const result = evaluateReleaseReadiness(
    JSON.parse(readFileSync(configPath, 'utf8'))
  )
  if (!result.ready) {
    console.error('WeChat release is blocked:')
    result.issues.forEach(issue => console.error(`- ${issue}`))
    process.exit(1)
  }

  console.log('WeChat formal release readiness gate passed.')
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLocaleLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLocaleLowerCase()

if (isMain) run()
