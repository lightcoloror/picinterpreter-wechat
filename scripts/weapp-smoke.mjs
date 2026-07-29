import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const automator = require('miniprogram-automator')

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectPath = path.resolve(scriptDirectory, '..')
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI ||
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'
const waitTimeoutMs = Number(process.env.WEAPP_E2E_TIMEOUT_MS || 45_000)
const enableIdeService = process.argv.includes('--enable-ide-service')
const isolatedReceiverStorageEntries = [
  ['cboard_communication_receiver_corrections', '[]'],
  ['cboard_communication_missing_tokens', '[]']
]

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds))

async function withTimeout(promise, description, timeoutMs = 10_000) {
  let timeoutHandle
  const operationPromise = Promise.resolve(promise)
  operationPromise.catch(() => {})
  try {
    return await Promise.race([
      operationPromise,
      new Promise((resolve, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Timed out during ${description}`)),
          timeoutMs
        )
      })
    ])
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function retry(description, operation, timeoutMs = waitTimeoutMs) {
  const deadline = Date.now() + timeoutMs
  let latestError

  while (Date.now() < deadline) {
    try {
      const remainingMs = Math.max(1, deadline - Date.now())
      const result = await withTimeout(
        operation(),
        description,
        Math.min(5_000, remainingMs)
      )
      if (result) {
        return result
      }
    } catch (error) {
      latestError = error
    }
    await sleep(250)
  }

  const suffix = latestError ? `: ${latestError.message}` : ''
  throw new Error(`Timed out waiting for ${description}${suffix}`)
}

async function waitForPagePath(miniProgram, expectedPath) {
  return retry(`page ${expectedPath}`, async () => {
    const page = await miniProgram.currentPage()
    return page?.path === expectedPath ? page : null
  })
}

async function waitForPage(miniProgram) {
  return waitForPagePath(miniProgram, 'pages/index/index')
}

async function waitForAppRoutes(miniProgram) {
  return retry('an initialized mini-program route', async () => {
    const routes = await miniProgram.evaluate(function readRoutes() {
      return getCurrentPages().map(page => page.route)
    })
    return Array.isArray(routes) && routes.length ? routes : null
  }, 90_000)
}

async function waitForElement(page, selector) {
  return retry(`selector ${selector}`, () => page.$(selector))
}

async function findElementByText(page, selector, expectedText) {
  return retry(`${selector} containing ${expectedText}`, async () => {
    const elements = await page.$$(selector)
    for (const element of elements) {
      const text = (await element.text()).trim()
      if (text.includes(expectedText)) {
        return element
      }
    }
    return null
  })
}

async function waitForText(page, selector, expectedText) {
  return retry(`${selector} text ${expectedText}`, async () => {
    const elements = await page.$$(selector)
    for (const element of elements) {
      const text = (await element.text()).trim()
      if (text.includes(expectedText)) {
        return text
      }
    }
    return null
  })
}

async function waitForReviewRowByToken(page, expectedToken) {
  return retry(`review row for ${expectedToken}`, async () => {
    const rows = await page.$$('.review-row')
    for (const row of rows) {
      const token = await row.$('.review-row__token')
      if (token && (await token.text()).trim() === expectedToken) {
        return row
      }
    }
    return null
  })
}

async function waitForReviewLabel(page, token, expectedLabel) {
  return retry(`review label ${token} -> ${expectedLabel}`, async () => {
    const row = await waitForReviewRowByToken(page, token)
    const label = await row.$('.review-row__label')
    return label && (await label.text()).trim() === expectedLabel
      ? row
      : null
  })
}

async function waitForReviewMatchType(page, token, expectedText) {
  return retry(`review match type ${token} -> ${expectedText}`, async () => {
    const row = await waitForReviewRowByToken(page, token)
    const matchType = await row.$('.review-row__match')
    return matchType && (await matchType.text()).trim() === expectedText
      ? row
      : null
  })
}

async function enterAndGenerateReceiverText(page, text, expectedToken = text) {
  const input = await waitForElement(page, '#receiver-input')
  await input.input(text)
  const generate = await waitForElement(page, '#receiver-generate-button')
  await generate.tap()
  return waitForReviewRowByToken(page, expectedToken)
}

async function replaceReviewPictogram(
  page,
  token,
  replacementLabel
) {
  const row = await waitForReviewRowByToken(page, token)
  const replaceButton = await row.$('.review-action--swap')
  assert.ok(replaceButton, `missing replacement action for ${token}`)
  await replaceButton.tap()
  const option = await findElementByText(
    page,
    '.replacement-option',
    replacementLabel
  )
  await option.tap()
  return waitForReviewLabel(page, token, replacementLabel)
}

async function snapshotWxStorage(miniProgram) {
  const info = await miniProgram.callWxMethod('getStorageInfoSync')
  const keys = Array.isArray(info?.keys) ? info.keys : []
  const entries = []
  for (const key of keys) {
    entries.push([
      key,
      await miniProgram.callWxMethod('getStorageSync', key)
    ])
  }
  return entries
}

async function restoreWxStorage(miniProgram, entries) {
  await miniProgram.callWxMethod('clearStorageSync')
  for (const [key, value] of entries) {
    await miniProgram.callWxMethod('setStorageSync', key, value)
  }
}

async function isolateReceiverStorage(miniProgram) {
  for (const [key, value] of isolatedReceiverStorageEntries) {
    await miniProgram.callWxMethod('setStorageSync', key, value)
  }
}

async function getAvailablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string', 'failed to reserve an automation port')
  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()))
  })
  return address.port
}

async function getDistinctAvailablePort(excludedPorts) {
  let port = await getAvailablePort()
  while (excludedPorts.has(port)) {
    port = await getAvailablePort()
  }
  excludedPorts.add(port)
  return port
}

async function launchMiniProgram() {
  if (process.platform !== 'win32' || !cliPath.toLowerCase().endsWith('.bat')) {
    return automator.launch({
      cliPath,
      projectPath,
      timeout: 120_000,
      trustProject: true
    })
  }

  // Node 22 no longer starts .bat files directly; use the developer tool's
  // bundled Node/CLI pair and connect through the automator's public API.
  const developerToolsDirectory = path.dirname(cliPath)
  const developerToolsNode = path.join(developerToolsDirectory, 'node.exe')
  const legacyDeveloperToolsCli = path.join(
    developerToolsDirectory,
    'code',
    'package.nw',
    'js',
    'common',
    'cli',
    'index.js'
  )
  const electronDeveloperToolsCli = path.join(
    developerToolsDirectory,
    'resources',
    'app.asar.unpacked',
    'js',
    'common',
    'cli',
    'index.js'
  )
  const useElectronCli = existsSync(electronDeveloperToolsCli)
  const developerToolsCli = useElectronCli
    ? electronDeveloperToolsCli
    : legacyDeveloperToolsCli
  const cliPortShim = path.join(scriptDirectory, 'wechat-cli-port-shim.cjs')
  const allocatedPorts = new Set()
  const cliBridgePort = await getDistinctAvailablePort(allocatedPorts)
  const servicePort = enableIdeService
    ? await getDistinctAvailablePort(allocatedPorts)
    : null
  const port = await getDistinctAvailablePort(allocatedPorts)
  let launchError = null
  let exitCode = null
  let cliOutput = ''
  const cliArguments = [
    'auto',
    '--project',
    projectPath
  ]
  if (servicePort) {
    cliArguments.push('--port', String(servicePort))
  }
  cliArguments.push('--auto-port', String(port), '--trust-project')
  const processHandle = useElectronCli
    ? spawn(
        process.env.ComSpec || 'cmd.exe',
        [
          '/d',
          '/s',
          '/c',
          'call',
          cliPath,
          ...cliArguments
        ],
        {
          cwd: developerToolsDirectory,
          env: {
            ...process.env,
            cwd: projectPath
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        }
      )
    : spawn(
        developerToolsNode,
        [
          '--require',
          cliPortShim,
          developerToolsCli,
          ...cliArguments
        ],
        {
          cwd: developerToolsDirectory,
          env: {
            ...process.env,
            cwd: projectPath,
            WEAPP_CLI_BRIDGE_PORT: String(cliBridgePort),
            WEAPP_CLI_INDEX_PATH: developerToolsCli
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        }
      )
  processHandle.stdin.write(enableIdeService ? 'y\n' : 'n\n')
  processHandle.stdin.end()
  const captureCliOutput = chunk => {
    cliOutput = `${cliOutput}${chunk.toString()}`.slice(-8_000)
  }
  processHandle.stdout.on('data', captureCliOutput)
  processHandle.stderr.on('data', captureCliOutput)
  processHandle.once('error', error => {
    launchError = error
  })
  processHandle.once('exit', code => {
    exitCode = code
  })

  const deadline = Date.now() + 120_000
  let connectionError = null
  while (Date.now() < deadline) {
    if (launchError) throw launchError
    if (exitCode !== null && exitCode !== 0) {
      throw new Error(
        `WeChat Developer Tools CLI exited with code ${exitCode}: ${cliOutput.trim()}`
      )
    }
    try {
      const connected = await automator.connect({
        wsEndpoint: `ws://127.0.0.1:${port}`
      })
      await sleep(5_000)
      return connected
    } catch (error) {
      connectionError = error
      await sleep(1_000)
    }
  }
  throw new Error(
    `WeChat Developer Tools automation timed out: ${
      cliOutput.trim() || connectionError?.message || 'no CLI output'
    }`
  )
}

function step(message) {
  process.stdout.write(`[weapp-smoke] ${message}\n`)
}

let miniProgram
let originalStorageSnapshot = null
const appExceptions = []
const appConsoleErrors = []

try {
  step('launching WeChat Developer Tools automation')
  miniProgram = await launchMiniProgram()
  miniProgram.on('exception', exception => {
    appExceptions.push(exception)
  })
  miniProgram.on('console', entry => {
    if (entry?.type === 'error' || entry?.level === 'error') {
      appConsoleErrors.push(entry)
    }
  })

  step('waiting for the initial mini-program route')
  const initialRoutes = await waitForAppRoutes(miniProgram)
  step(`connected to routes ${initialRoutes.join(', ')}`)
  step('snapshotting existing WeChat local storage')
  originalStorageSnapshot = await withTimeout(
    snapshotWxStorage(miniProgram),
    'snapshotting existing WeChat local storage',
    30_000
  )
  step(`snapshotted ${originalStorageSnapshot.length} storage entries`)
  step('isolating receiver correction and missing-token storage')
  await withTimeout(
    isolateReceiverStorage(miniProgram),
    'isolating receiver storage'
  )
  let page = await waitForPage(miniProgram)
  const initialView = await retry(
    'the onboarding or communication view',
    async () => {
      if (await page.$('.communication-onboarding')) {
        return 'onboarding'
      }
      if (await page.$('.communication-page')) {
        return 'communication'
      }
      return null
    }
  )
  if (initialView === 'onboarding') {
    step('completing first-use onboarding for the temporary test state')
    const start = await waitForElement(
      page,
      '.communication-onboarding__start'
    )
    await start.tap()
  }
  await waitForElement(page, '.communication-page')
  const existingExpression = await page.$$('.expression-chip')
  if (existingExpression.length) {
    step('clearing the current expression through the product UI')
    const clearExpression = await findElementByText(
      page,
      '.sequence-actions .button--quiet',
      '清空'
    )
    await clearExpression.tap()
    await retry('the current expression to clear', async () =>
      (await page.$$('.expression-chip')).length === 0 ? true : null
    )
  }
  const initialScreenshotPath = path.join(
    projectPath,
    'dist',
    'weapp-smoke-initial.png'
  )
  step('capturing the initial simulator screen')
  await withTimeout(miniProgram.screenshot({ path: initialScreenshotPath }), 'capturing the initial simulator screen')
  step(`captured initial simulator screen at ${initialScreenshotPath}`)
  const pageData = await withTimeout(
    page.data(),
    'reading the initial page data',
    15_000
  )
  step(`initial page data keys: ${Object.keys(pageData).slice(0, 12).join(', ')}`)

  step('building and confirming a patient expression')
  for (const label of ['我想要', '喝', '水']) {
    const tile = await findElementByText(page, '.tile-button', label)
    await tile.tap()
  }
  await waitForText(page, '.candidate__sentence', '我想要喝水')
  const confirmExpression = await findElementByText(
    page,
    '.button--primary',
    '确认并保存'
  )
  await confirmExpression.tap()
  await waitForText(page, '.storage-notice', '表达已确认')
  await waitForText(page, '.history-row__text', '我想要喝水')

  step('running the caregiver receiver flow')
  const receiverMode = await findElementByText(
    page,
    '.mode-switch__button',
    '接收理解'
  )
  await receiverMode.tap()
  page = await waitForPagePath(
    miniProgram,
    'packages/caregiver/pages/receiver/index'
  )
  const receiverExample = await findElementByText(page, '.example-chip', '想喝水')
  await receiverExample.tap()
  const generateReceiver = await findElementByText(
    page,
    '.receiver-input-panel .button--primary',
    '生成图片序列'
  )
  await generateReceiver.tap()
  await waitForElement(page, '.quality-banner--ready')
  await waitForText(page, '.receiver-preview__label', '水')
  const learningSwitch = await waitForElement(
    page,
    '#receiver-correction-learning-switch'
  )
  assert.equal(
    await learningSwitch.property('checked'),
    true,
    'receiver correction learning should default to enabled'
  )

  step('opening the isolated receiver display and saving its history')
  const openDisplay = await findElementByText(
    page,
    '.receiver-output-panel .button--primary',
    '全屏展示并保存'
  )
  await openDisplay.tap()
  await waitForElement(page, '.receiver-display-page')
  assert.equal(
    await page.$('.communication-page'),
    null,
    'receiver display must not be layered on top of the communication page'
  )
  await waitForText(page, '.receiver-display__label', '水')

  const closeDisplay = await findElementByText(
    page,
    '.button--display-back',
    '返回继续沟通'
  )
  await closeDisplay.tap()
  await waitForElement(page, '.workspace--receiver')

  step('verifying learned replacement reuse in the current workspace')
  await enterAndGenerateReceiverText(page, '水')
  await replaceReviewPictogram(page, '水', '是的')
  await enterAndGenerateReceiverText(page, '水')
  await waitForReviewLabel(page, '水', '是的')
  await waitForReviewMatchType(page, '水', '人工确认')

  step('verifying learned deletion tombstone reuse')
  await enterAndGenerateReceiverText(page, '喝')
  const drinkRow = await waitForReviewRowByToken(page, '喝')
  const deleteDrink = await drinkRow.$('.review-action--delete')
  assert.ok(deleteDrink, 'missing delete action for 喝')
  await deleteDrink.tap()
  await retry('the deleted 喝 row to disappear', async () =>
    (await page.$$('.review-row')).length === 0 ? true : null
  )
  await enterAndGenerateReceiverText(page, '喝')
  await waitForReviewLabel(page, '喝', '尚未匹配图片')
  await waitForReviewMatchType(page, '喝', '未匹配')

  step('verifying that disabled learning does not change later matching')
  const learningSwitchAfterDeletion = await waitForElement(
    page,
    '#receiver-correction-learning-switch'
  )
  await learningSwitchAfterDeletion.tap()
  await retry('receiver correction learning to be disabled', async () => {
    const currentSwitch = await page.$(
      '#receiver-correction-learning-switch'
    )
    return currentSwitch &&
      (await currentSwitch.property('checked')) === false
      ? true
      : null
  })
  await enterAndGenerateReceiverText(page, '吃')
  await waitForReviewLabel(page, '吃', '吃')
  await replaceReviewPictogram(page, '吃', '是的')
  await enterAndGenerateReceiverText(page, '吃')
  await waitForReviewLabel(page, '吃', '吃')
  await waitForReviewMatchType(page, '吃', '准确匹配')

  step('returning to the patient page and verifying two-way history')
  const expressMode = await waitForElement(page, '#express-mode-button')
  await expressMode.tap()
  page = await waitForPage(miniProgram)
  const caregiverTools = await waitForElement(
    page,
    '#caregiver-tools-toggle'
  )
  await caregiverTools.tap()
  const historyManager = await waitForElement(
    page,
    '#history-manager-button'
  )
  await historyManager.tap()
  await waitForElement(page, '.history-manager')
  await waitForText(page, '.history-row__text', '我想要喝水')
  await waitForText(page, '.history-row__text', '想喝水')
  await waitForText(page, '.history-row__direction--receive', '接收')
  const returnFromHistory = await findElementByText(
    page,
    '.utility-page__back',
    '返回沟通'
  )
  await returnFromHistory.tap()

  step('starting a new conversation without erasing historical records')
  const newConversation = await findElementByText(
    page,
    '.conversation-session__reset',
    '新对话'
  )
  await newConversation.tap()
  await waitForText(page, '.conversation-session__notice', '原有历史仍会保留')

  step('round-tripping through the receiver page without erasing history')
  const restoredReceiverMode = await waitForElement(
    page,
    '#receiver-mode-button'
  )
  await restoredReceiverMode.tap()
  page = await waitForPagePath(
    miniProgram,
    'packages/caregiver/pages/receiver/index'
  )
  const restoredExpressMode = await waitForElement(
    page,
    '#express-mode-button'
  )
  await restoredExpressMode.tap()
  page = await waitForPage(miniProgram)
  const restoredCaregiverTools = await waitForElement(
    page,
    '#caregiver-tools-toggle'
  )
  await restoredCaregiverTools.tap()
  const restoredHistoryManager = await waitForElement(
    page,
    '#history-manager-button'
  )
  await restoredHistoryManager.tap()
  await waitForElement(page, '.history-manager')
  await waitForText(page, '.history-row__text', '我想要喝水')
  await waitForText(page, '.history-row__text', '想喝水')

  const storageInfo = await withTimeout(
    miniProgram.callWxMethod('getStorageInfoSync'),
    'reading persisted storage keys'
  )
  assert.ok(storageInfo.keys.length > 0, 'expected persisted communication storage keys')
  assert.deepEqual(appExceptions, [], 'unexpected mini-program runtime exception')

  step(
    'PASS: UI, isolated display, correction memory, two-way history, and route restoration'
  )
} catch (error) {
  const diagnostics = [
    appExceptions.length ? `exceptions=${JSON.stringify(appExceptions)}` : '',
    appConsoleErrors.length
      ? `consoleErrors=${JSON.stringify(appConsoleErrors)}`
      : ''
  ].filter(Boolean)
  process.stderr.write(
    `[weapp-smoke] FAIL: ${error.stack || error.message}${
      diagnostics.length ? `\n${diagnostics.join('\n')}` : ''
    }\n`
  )
  process.exitCode = 1
} finally {
  if (miniProgram) {
    if (originalStorageSnapshot) {
      try {
        await withTimeout(
          restoreWxStorage(miniProgram, originalStorageSnapshot),
          'restoring original WeChat local storage',
          30_000
        )
        step(
          `restored ${originalStorageSnapshot.length} original storage entries`
        )
      } catch (error) {
        process.stderr.write(
          `[weapp-smoke] storage restore warning: ${error.message}\n`
        )
        process.exitCode = 1
      }
    }
    try {
      await withTimeout(miniProgram.close(), 'closing WeChat Developer Tools')
    } catch (error) {
      miniProgram.disconnect()
      process.stderr.write(
        `[weapp-smoke] cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
}
