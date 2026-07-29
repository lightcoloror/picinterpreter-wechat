import { spawn } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startAccountFakeApi } from './weapp-account-fake-api.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectPath = path.resolve(scriptDirectory, '..')
const privateConfigPath = path.join(
  projectPath,
  'project.private.config.json'
)
const originalApiBaseUrl = process.env.TARO_APP_API_BASE_URL
const originalPrivateConfig = existsSync(privateConfigPath)
  ? readFileSync(privateConfigPath, 'utf8')
  : null
const npmCliPath = process.env.npm_execpath
const runOcrOnly = process.argv.includes('--ocr')
const logPrefix = runOcrOnly
  ? 'weapp-ocr-e2e'
  : 'weapp-account-e2e'

function allowLocalE2eApi() {
  const privateConfig = originalPrivateConfig
    ? JSON.parse(originalPrivateConfig)
    : {}
  privateConfig.setting = {
    ...(privateConfig.setting || {}),
    urlCheck: false
  }
  writeFileSync(
    privateConfigPath,
    `${JSON.stringify(privateConfig, null, 2)}\n`,
    'utf8'
  )
}

function restorePrivateConfig() {
  if (originalPrivateConfig === null) {
    rmSync(privateConfigPath, { force: true })
    return
  }
  writeFileSync(privateConfigPath, originalPrivateConfig, 'utf8')
}

function runNpmScript(script, environment = {}) {
  const env = { ...process.env, ...environment }
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete env[key]
  }
  const windows = process.platform === 'win32'
  const command = npmCliPath
    ? process.execPath
    : windows
      ? process.env.ComSpec || 'cmd.exe'
      : 'npm'
  const args = npmCliPath
    ? [npmCliPath, 'run', script]
    : windows
      ? ['/d', '/s', '/c', 'call', 'npm', 'run', script]
      : ['run', script]

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectPath,
      env,
      windowsHide: true,
      stdio: 'inherit'
    })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`npm run ${script} exited with code ${code}`))
    })
  })
}

let scenarioError = null
const restoreErrors = []
let fakeApi = null

try {
  fakeApi = await startAccountFakeApi()
  process.stdout.write(
    `[${logPrefix}] fake API ready at ${fakeApi.baseUrl}\n`
  )
  allowLocalE2eApi()
  await runNpmScript('build:weapp', {
    TARO_APP_API_BASE_URL: fakeApi.baseUrl
  })
  await runNpmScript('test:e2e:weapp', {
    WEAPP_E2E_ACCOUNT_SYNC_ONLY: runOcrOnly ? undefined : '1',
    WEAPP_E2E_OCR_ONLY: runOcrOnly ? '1' : undefined,
    WEAPP_E2E_FAKE_API_CONTROL_URL: fakeApi.baseUrl
  })
} catch (error) {
  scenarioError = error
} finally {
  try {
    restorePrivateConfig()
  } catch (error) {
    restoreErrors.push(`private config: ${error.message}`)
  }
  try {
    await runNpmScript('build:weapp', {
      TARO_APP_API_BASE_URL: originalApiBaseUrl
    })
  } catch (error) {
    restoreErrors.push(`default build: ${error.message}`)
  }
  if (fakeApi) {
    try {
      await fakeApi.close()
    } catch (error) {
      restoreErrors.push(`fake API: ${error.message}`)
    }
  }
}

if (scenarioError) {
  if (restoreErrors.length) {
    scenarioError.message +=
      `; restoration also failed: ${restoreErrors.join(', ')}`
  }
  throw scenarioError
}
if (restoreErrors.length) {
  throw new Error(`Account E2E restoration failed: ${restoreErrors.join(', ')}`)
}
