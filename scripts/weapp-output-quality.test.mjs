import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectGeneratedPng } from './generated-png-integrity.mjs'
import {
  createStorageRecoveryDocument,
  isRetryableWechatideOperation,
  isTransientWechatideTransportError,
  parseStorageRecoveryDocument,
  storageRecoveryPath,
  unexpectedSimulatorConsoleErrors
} from './weapp-e2e-safety.mjs'
import {
  findPrivacyPermissionIssues,
  findUnusedDeclaredComponents,
  findWxmlDependencySources,
  hasRuntimePluginUsage
} from './weapp-output-quality.mjs'

const generatedPngFixture = readFileSync(
  new URL(
    '../src/assets/cboard-default/28826a9cc4878ed5.png',
    import.meta.url
  )
)

test('generated PNG assets satisfy the decodable PNG8 contract', () => {
  const metadata = inspectGeneratedPng(generatedPngFixture)

  assert.equal(metadata.width, 96)
  assert.equal(metadata.height, 96)
  assert.equal(metadata.bitDepth, 8)
  assert.equal(metadata.colorType, 3)
  assert.ok(metadata.paletteColors >= 1)
  assert.ok(metadata.paletteColors <= 32)
})

test('generated PNG integrity rejects modified chunk bytes', () => {
  const corrupted = Buffer.from(generatedPngFixture)
  corrupted[50] ^= 1

  assert.throws(
    () => inspectGeneratedPng(corrupted),
    /chunk checksum does not match/
  )
})

test('generated PNG integrity rejects trailing bytes', () => {
  assert.throws(
    () =>
      inspectGeneratedPng(
        Buffer.concat([generatedPngFixture, Buffer.from([0])])
      ),
    /trailing bytes are present/
  )
})

test('plugin usage requires a production runtime call with the configured name', () => {
  assert.equal(
    hasRuntimePluginUsage(
      'WechatSI',
      'const plugin = requirePlugin("WechatSI")'
    ),
    true
  )
  assert.equal(
    hasRuntimePluginUsage(
      'WechatSI',
      "const plugin = requirePlugin('OtherPlugin')"
    ),
    false
  )
  assert.equal(
    hasRuntimePluginUsage('WechatSI', 'const plugin = requirePlugin(name)'),
    false
  )
})

test('privacy permissions allow only the reviewed recording purpose', () => {
  assert.deepEqual(
    findPrivacyPermissionIssues({
      'scope.record': {
        desc: '用于用户主动语音输入和为个人图卡录制声音'
      }
    }),
    []
  )

  assert.deepEqual(
    findPrivacyPermissionIssues({
      'scope.record': { desc: '改善体验' },
      'scope.userLocation': { desc: '未使用' }
    }),
    [
      'unsupported permission scope.userLocation',
      'scope.record must describe active voice input and personal tile recording'
    ]
  )
  assert.deepEqual(
    findPrivacyPermissionIssues({}),
    ['missing required permission scope.record']
  )
})

test('component usage is checked against the declaring page only', () => {
  assert.deepEqual(
    findUnusedDeclaredComponents(
      { used: './used', stale: './stale' },
      '<view><used /></view>',
      '<stale />'
    ),
    ['stale']
  )
})

test('global component declarations may use the complete WXML inventory', () => {
  assert.deepEqual(
    findUnusedDeclaredComponents(
      { shared: './shared' },
      undefined,
      '<view><shared></shared></view>'
    ),
    []
  )
})

test('WXML imports and includes expose page-local template dependencies', () => {
  assert.deepEqual(
    findWxmlDependencySources(
      '<import src="../../base.wxml"/><include src="./fragment.wxml" />'
    ),
    ['../../base.wxml', './fragment.wxml']
  )
})

test('storage recovery is project-scoped and checksum protected', () => {
  const projectPath = 'D:\\workspace\\cboard-wechat-poc'
  const document = createStorageRecoveryDocument({
    projectPath,
    createdAt: '2026-07-28T10:00:00.000Z',
    entries: [['example', '{"safe":true}']]
  })

  assert.deepEqual(
    parseStorageRecoveryDocument(JSON.stringify(document), projectPath)
      .entries,
    [['example', '{"safe":true}']]
  )
  assert.match(
    storageRecoveryPath('C:\\temp', projectPath),
    /storage-recovery-v1-[a-f0-9]{16}\.json$/
  )
  assert.throws(
    () => parseStorageRecoveryDocument(
      JSON.stringify({ ...document, checksum: 'invalid' }),
      projectPath
    ),
    /checksum does not match/
  )
})

test('only the exact WeChat DevTools route race is ignored', () => {
  const knownRouteRace = [
    '["[error]","routeDone with a webviewId 30 is not found"]',
    '["[error]","[String] <Error: SystemError (appServiceSDKScriptError)\\n\\"[Page route 错误(system error)] routeDone with a webviewId 30 is not found\\">"]'
  ].join('\n')

  assert.equal(unexpectedSimulatorConsoleErrors(knownRouteRace), '')
  assert.match(
    unexpectedSimulatorConsoleErrors(
      `${knownRouteRace}\n["[error]","application data failed"]`
    ),
    /application data failed/
  )
  assert.equal(
    unexpectedSimulatorConsoleErrors('unstructured error'),
    'unstructured error'
  )
})

test('transient WeChat IDE retries are limited to idempotent operations', () => {
  assert.equal(
    isTransientWechatideTransportError(
      new Error(
        'Client network socket disconnected before secure TLS connection was established'
      )
    ),
    true
  )
  assert.equal(
    isRetryableWechatideOperation('automation_element_action', {
      action: 'input'
    }),
    true
  )
  assert.equal(
    isRetryableWechatideOperation('automation_wx_api', {
      action: 'call',
      method: 'setStorageSync'
    }),
    true
  )
  assert.equal(
    isRetryableWechatideOperation('automation_element_action', {
      action: 'tap'
    }),
    false
  )
  assert.equal(
    isRetryableWechatideOperation('automation_wx_api', {
      action: 'call',
      method: 'saveFile'
    }),
    false
  )
})
