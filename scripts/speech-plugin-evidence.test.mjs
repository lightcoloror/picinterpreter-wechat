import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inspectBuiltSpeechPlugin, parseSafeProductionSettings } from './create-release-evidence.mjs'

test('speech evidence reads the artifact and never treats an unused switch as capability', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tuyujia-speech-evidence-'))
  writeFileSync(path.join(dir, 'app.json'), JSON.stringify({plugins:{WechatSI:{version:'0.3.4',provider:'synthetic-provider'}}}))
  assert.deepEqual(inspectBuiltSpeechPlugin(dir), {source:'app.json',declared:true,version:'0.3.4',provider:'synthetic-provider',serviceAvailability:'not_verified',deviceAcceptance:'not_verified'})
  assert.equal(parseSafeProductionSettings('TARO_APP_WECHAT_SI_ENABLED=false').TARO_APP_WECHAT_SI_ENABLED, undefined)
  writeFileSync(path.join(dir, 'app.json'), '{}')
  assert.equal(inspectBuiltSpeechPlugin(dir).declared, false)
})
