import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import JSZip from 'jszip'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createStorageRecoveryDocument,
  isRetryableWechatideOperation,
  isTransientWechatideTransportError,
  parseStorageRecoveryDocument,
  storageRecoveryPath,
  unexpectedSimulatorConsoleErrors
} from './weapp-e2e-safety.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectPath = path.resolve(scriptDirectory, '..')
const developerToolsCli = process.env.WECHAT_DEVTOOLS_CLI || ''
const wechatideCandidates = [
  process.env.WECHATIDE_SKILL_CLI,
  developerToolsCli
    ? path.join(path.dirname(developerToolsCli), 'wechatide.cmd')
    : '',
  'D:\\Tencent\\微信web开发者工具\\wechatide.cmd',
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\wechatide.cmd'
].filter(Boolean)
const wechatidePath =
  wechatideCandidates.find(candidate => existsSync(candidate)) ||
  wechatideCandidates[0]
const clientName = process.env.WECHATIDE_CLIENT_NAME || 'Codex'
const waitTimeoutMs = Number(process.env.WEAPP_E2E_TIMEOUT_MS || 45_000)
const tempDirectory = path.join(tmpdir(), 'cboard-wechat-skill-smoke')
const storageRecoveryFile = storageRecoveryPath(tempDirectory, projectPath)
const restoreStorageRecoveryOnly =
  process.argv.includes('--restore-storage-recovery')
const YES_TILE_ID = 'HJVQMR9pX5F-'
const YES_TILE_LABEL = '是'
const NO_TILE_ID = 'SkBQMRqpX5t-'
const NO_TILE_LABEL = '不'
const FIRST_HOME_FOLDER_TILE_ID = 'S1LQGA9p7qK-'
const QUICK_CHAT_BOARD_ID = 'BJgYav2vp-'
const QUICK_CHAT_BOARD_NAME = '快速交流'
const HOME_BOARD_ID = 'root'
const ADULT_CARE_CORE_FOLDER_TILE_ID = 'pi-home-core-words'
const ADULT_CARE_REPAIR_FOLDER_TILE_ID = 'pi-home-repair'
const ADULT_CARE_CALL_DOCTOR_TILE_ID = 'pi-home-call-doctor'
const PATIENT_PAGE_ROUTE = '/packages/caregiver/pages/patient/index'
const OCR_PAGE_ROUTE = '/packages/ocr/pages/capture/index'
const PICTURE_LIBRARY_PAGE_ROUTE =
  '/packages/backup/pages/personal-images/index'
const BOARD_MANAGEMENT_PAGE_ROUTE =
  '/packages/backup/pages/boards/index'
const YES_DEFAULT_IMAGE =
  '/assets/cboard-default/28826a9cc4878ed5.png'
const NO_DEFAULT_IMAGE =
  '/assets/cboard-default/d27cad8ecc0fe96d.png'
const YES_BACKUP_IMAGE = YES_DEFAULT_IMAGE
const YES_PERSONAL_IMAGE_SELECT_ID =
  '.personal-image-card .personal-image-action--primary'
const YES_PERSONAL_IMAGE_RESTORE_ID = '.personal-image-action--restore'
const PERSONAL_IMAGE_TEST_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PERSONAL_IMAGE_STORAGE_KEY =
  'cboard_communication_personal_image_preferences'
const MISSING_TOKEN_STORAGE_KEY =
  'cboard_communication_missing_tokens'
const RECEIVER_RECORD_STORAGE_KEY =
  'cboard_communication_receiver_records'
const CBOARD_ACCOUNT_SESSION_STORAGE_KEY = 'cboard_account_session'
const CBOARD_AUTH_TOKEN_STORAGE_KEY = 'cboard_auth_token'
const ACCOUNT_REQUEST_LOG_STORAGE_KEY = 'cboard_account_e2e_request_log'
const IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY =
  'picinterpreter.communication.image-text-intent.v1'
const OCR_RECOGNIZED_TEXT = '我想吃苹里'
const OCR_CORRECTED_TEXT = '我想吃苹果'
const PICTURE_LIBRARY_FILE_SLOT_KEY =
  'picinterpreter_picture_library_file_slot_v1'
const PICTURE_LIBRARY_STORAGE_KEY =
  'picinterpreter_picture_library_boards_v1'
const PERSONAL_CARD_COPY_SOURCE_TILE_ID =
  'device_private_custom_e2e_multiboard_source'
const PERSONAL_CARD_COPY_LABEL = '多板共享图卡'
const PERSONAL_BOARD_ID_PREFIX = 'device_private_board_'
const PERSONAL_BOARD_LINK_ID_PREFIX = 'device_private_link_'
const PERSONAL_BOARD_NAME = 'E2E 家庭板'
const RENAMED_PERSONAL_BOARD_NAME = 'E2E 家庭常用'
const AAC_IMPORT_TEST_FILE_NAME = 'picinterpreter-aac-import-e2e.obf'
const AAC_IMPORT_TEST_BOARD_NAME = '图语家 OBF 运行验收板'
const AAC_IMPORT_TEST_TILE_LABEL = '我要喝水'
const AAC_IMPORT_TEST_OBZ_FILE_NAME =
  'picinterpreter-aac-import-e2e.obz'
const AAC_IMPORT_TEST_OBZ_HOME_NAME = '图语家 OBZ 运行首页'
const AAC_IMPORT_TEST_OBZ_MORE_NAME = '图语家 OBZ 运行更多'
const AAC_IMPORT_TEST_GRD_FILE_NAME =
  'picinterpreter-aac-import-e2e.grd'
const AAC_IMPORT_TEST_GRD_HOME_NAME = '图语家 GRD 运行首页'
const AAC_IMPORT_TEST_GRD_MORE_NAME = '图语家 GRD 运行更多'
const AAC_IMPORT_TEST_GRIDSET_FILE_NAME =
  'picinterpreter-aac-import-e2e.gridset'
const AAC_IMPORT_TEST_GRIDSET_BOARD_NAME = '图语家 Gridset 运行主页'
const AAC_IMPORT_TEST_WAV =
  'UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='
const STANDARD_COMMUNICATION_LOG_PREFIX = '图语家_标准沟通日志_'
const ANONYMIZED_COMMUNICATION_LOG_PREFIX = '图语家_匿名研究日志_'
const PICTURE_LIBRARY_BACKUP_PREFIX = 'picinterpreter-picture-library-'
const LOCAL_DEVICE_DATA_BACKUP_PREFIX = 'picinterpreter-local-device-data-'
const COMMUNICATION_HISTORY_STORAGE_KEY = 'cboard_communication_history'
const SAVED_PHRASE_STORAGE_KEY = 'cboard_communication_saved_phrases'
const SAVED_PHRASE_TOMBSTONE_STORAGE_KEY =
  'cboard_communication_saved_phrase_tombstones'
const RECEIVER_CORRECTION_STORAGE_KEY =
  'cboard_communication_receiver_corrections'
const FEEDBACK_DRAFT_STORAGE_KEY =
  'cboard_communication_expression_candidate_feedback_drafts'
const PICTOGRAM_ORDERING_STORAGE_KEY =
  'cboard_communication_pictogram_ordering_v1'
const OPEN_BOARD_LOG_ANONYMIZATIONS = [
  'id_pseudonymization',
  'timestamp_shift',
  'timestamp_jitter',
  'geolocation_masking',
  'net_masking',
  'fringe_masking',
  'name_masking',
  'url_stripping',
  'extras_removed'
]
const runAccessibilityOnly =
  process.env.WEAPP_E2E_ACCESSIBILITY_ONLY === '1'
const runBoardManagementOnly =
  !runAccessibilityOnly &&
  process.env.WEAPP_E2E_BOARD_MANAGEMENT_ONLY === '1'
const runPersonalCardCopyOnly =
  !runAccessibilityOnly &&
  !runBoardManagementOnly &&
  process.env.WEAPP_E2E_PERSONAL_CARD_COPY_ONLY === '1'
const runAdultCareDefaultsOnly =
  !runAccessibilityOnly &&
  !runBoardManagementOnly &&
  !runPersonalCardCopyOnly &&
  process.env.WEAPP_E2E_ADULT_CARE_DEFAULTS_ONLY === '1'
const runFeedbackOnly =
  !runAccessibilityOnly &&
  !runBoardManagementOnly &&
  !runPersonalCardCopyOnly &&
  !runAdultCareDefaultsOnly &&
  process.env.WEAPP_E2E_FEEDBACK_ONLY === '1'
const runBoardVisibilityOnly =
  !runFeedbackOnly &&
  process.env.WEAPP_E2E_BOARD_VISIBILITY_ONLY === '1'
const runLibraryPlacementOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  process.env.WEAPP_E2E_LIBRARY_PLACEMENT_ONLY === '1'
const runOfflineOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  process.env.WEAPP_E2E_OFFLINE_ONLY === '1'
const runStorageFailureOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  !runOfflineOnly &&
  process.env.WEAPP_E2E_STORAGE_FAILURE_ONLY === '1'
const runHistoryReviewOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  !runOfflineOnly &&
  !runStorageFailureOnly &&
  process.env.WEAPP_E2E_HISTORY_REVIEW_ONLY === '1'
const runSessionOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  !runOfflineOnly &&
  !runStorageFailureOnly &&
  !runHistoryReviewOnly &&
  process.env.WEAPP_E2E_SESSION_ONLY === '1'
const runOrderingOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  !runOfflineOnly &&
  !runStorageFailureOnly &&
  !runHistoryReviewOnly &&
  !runSessionOnly &&
  process.env.WEAPP_E2E_ORDERING_ONLY === '1'
const runOcrOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  !runOfflineOnly &&
  !runStorageFailureOnly &&
  !runHistoryReviewOnly &&
  !runSessionOnly &&
  !runOrderingOnly &&
  process.env.WEAPP_E2E_OCR_ONLY === '1'
const runAccountSyncOnly =
  !runFeedbackOnly &&
  !runBoardVisibilityOnly &&
  !runLibraryPlacementOnly &&
  !runOfflineOnly &&
  !runStorageFailureOnly &&
  !runHistoryReviewOnly &&
  !runSessionOnly &&
  !runOrderingOnly &&
  !runOcrOnly &&
  (
    process.env.WEAPP_E2E_ACCOUNT_SYNC_ONLY === '1' ||
    process.env.WEAPP_E2E_ACCOUNT_SYNC === '1'
  )
const runAccountSyncScenario = runAccountSyncOnly
const runServerAacScenario =
  process.env.WEAPP_E2E_SERVER_AAC === '1' && !runAccountSyncOnly
const accountFakeApiControlUrl = String(
  process.env.WEAPP_E2E_FAKE_API_CONTROL_URL || ''
).replace(/\/+$/, '')
const allowWindowManagement =
  process.argv.includes('--allow-window-management') ||
  process.env.WEAPP_E2E_ALLOW_WINDOW_MANAGEMENT === '1'
const backgroundOnly = !allowWindowManagement
const mockedWxMethods = new Set()
const isolatedStorageEntries = [
  ['cboard_communication_history', '[]'],
  ['cboard_tuyujia_history', '[]'],
  ['cboard_communication_saved_phrases', '[]'],
  ['cboard_tuyujia_saved_phrases', '[]'],
  ['cboard_communication_saved_phrase_tombstones', '[]'],
  [FEEDBACK_DRAFT_STORAGE_KEY, '[]'],
  ['cboard_communication_receiver_records', '[]'],
  ['cboard_communication_receiver_resume_record', ''],
  ['cboard_communication_receiver_corrections', '[]'],
  ['cboard_communication_missing_tokens', '[]'],
  ['cboard_communication_personal_image_preferences', '[]'],
  [
    'cboard_communication_preferences',
    JSON.stringify({
      highContrast: false,
      fontSize: 'normal',
      gridColumns: 3,
      speechRate: 1,
      onlinePictogramSearchEnabled: false,
      pictogramSortMode: 'manual',
      hiddenBoardIds: [],
      onboardingComplete: true
    })
  ],
  [
    PICTOGRAM_ORDERING_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      manualOrderByBoard: {},
      usageByTileKey: {}
    })
  ]
]
const isolatedStorageKeysToRemove = [
  'cboard_communication_active_session',
  CBOARD_ACCOUNT_SESSION_STORAGE_KEY,
  CBOARD_AUTH_TOKEN_STORAGE_KEY,
  ACCOUNT_REQUEST_LOG_STORAGE_KEY
]

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds))

function step(message) {
  process.stdout.write(`[weapp-skill-smoke] ${message}\n`)
}

function parseToolPayload(output, tool) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error(`${tool} did not return JSON: ${output.trim()}`)
  }

  let payload
  try {
    payload = JSON.parse(output.slice(start, end + 1))
  } catch (error) {
    throw new Error(`${tool} returned invalid JSON: ${error.message}`)
  }

  if (!payload.ok) {
    throw new Error(
      `${tool} failed: ${payload.message || JSON.stringify(payload)}`
    )
  }
  if (
    typeof payload.result === 'string' &&
    payload.result.startsWith('MCP error')
  ) {
    throw new Error(`${tool} failed: ${payload.result}`)
  }
  return payload.result
}

async function invokeToolOnce(tool, options = {}, timeoutMs = 30_000) {
  const args = ['-c', clientName, tool]
  const jsonFiles = []

  try {
    for (const [name, value] of Object.entries(options)) {
      if (value === undefined || value === null) continue
      if (name === 'args' || name === 'result') {
        mkdirSync(tempDirectory, { recursive: true })
        const jsonFile = path.join(
          tempDirectory,
          `${name}-${process.pid}-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}.json`
        )
        writeFileSync(jsonFile, JSON.stringify(value), 'utf8')
        args.push(`--${name}-file`, jsonFile)
        jsonFiles.push(jsonFile)
        continue
      }
      args.push(`--${name}`, String(value))
    }

    const command = process.platform === 'win32'
      ? process.env.ComSpec || 'cmd.exe'
      : wechatidePath
    const commandArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'call', wechatidePath, ...args]
      : args

    const output = await new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        cwd: projectPath,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`${tool} timed out after ${timeoutMs} ms`))
      }, timeoutMs)

      child.stdout.on('data', chunk => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', chunk => {
        stderr += chunk.toString()
      })
      child.once('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', code => {
        clearTimeout(timer)
        const combinedOutput = `${stdout}\n${stderr}`
        if (
          code !== 0 &&
          (
            combinedOutput.indexOf('{') < 0 ||
            combinedOutput.lastIndexOf('}') < 0
          )
        ) {
          reject(
            new Error(
              `${tool} exited with code ${code}: ${combinedOutput}`
            )
          )
          return
        }
        resolve(combinedOutput)
      })
    })

    return parseToolPayload(output, tool)
  } finally {
    jsonFiles.forEach(jsonFile => rmSync(jsonFile, { force: true }))
  }
}

async function invokeTool(tool, options = {}, timeoutMs = 30_000) {
  const attempts = isRetryableWechatideOperation(tool, options) ? 3 : 1
  let latestError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await invokeToolOnce(tool, options, timeoutMs)
    } catch (error) {
      latestError = error
      if (
        attempt === attempts ||
        !isTransientWechatideTransportError(error)
      ) {
        throw error
      }
      step(
        `retrying idempotent ${tool} after a transient WeChat IDE connection error`
      )
      await sleep(attempt * 750)
    }
  }
  throw latestError
}

async function retry(description, operation, timeoutMs = waitTimeoutMs) {
  const deadline = Date.now() + timeoutMs
  let latestError

  while (Date.now() < deadline) {
    try {
      const value = await operation()
      if (value) return value
    } catch (error) {
      latestError = error
    }
    await sleep(400)
  }

  const suffix = latestError ? `: ${latestError.message}` : ''
  throw new Error(`Timed out waiting for ${description}${suffix}`)
}

async function queryElements(selector) {
  const query = () => invokeTool('automation_page_action', {
    project: projectPath,
    action: 'querySelectorAll',
    selector
  }, 15_000)

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const result = await query()
      return Array.isArray(result?.elements) ? result.elements : []
    } catch (error) {
      const message = String(error?.message || error)
      const isTransientAutomatorTimeout =
        message.includes('automation_page_action timed out') ||
        message.includes('timeout waiting for automator response')
      if (!isTransientAutomatorTimeout || attempt === 4) throw error
      await sleep(attempt * 800)
    }
  }
  return []
}

async function waitForSelector(selector, timeoutMs = waitTimeoutMs) {
  return retry(`selector ${selector}`, async () => {
    const elements = await queryElements(selector)
    return elements.length ? elements : null
  }, timeoutMs)
}

async function waitForNoSelector(selector) {
  return retry(`selector ${selector} to disappear`, async () =>
    (await queryElements(selector)).length === 0 ? true : null
  )
}

async function tap(selector) {
  await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'tap',
    selector,
    'wait-for-selector': selector
  })
}

async function trigger(selector, type, detail) {
  await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'trigger',
    selector,
    type,
    detail: JSON.stringify(detail),
    'wait-for-selector': selector
  })
}

async function input(selector, value) {
  await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'input',
    selector,
    value,
    'wait-for-selector': selector
  })
}

async function readText(selector) {
  const value = await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'text',
    selector,
    'wait-for-selector': selector
  })
  return String(value || '').trim()
}

async function waitForText(
  selector,
  expectedText,
  timeoutMs = waitTimeoutMs
) {
  return retry(`${selector} text ${expectedText}`, async () => {
    const value = await readText(selector)
    return value.includes(expectedText) ? value : null
  }, timeoutMs)
}

async function readProperty(selector, name) {
  return invokeTool('automation_element_action', {
    project: projectPath,
    action: 'property',
    selector,
    name,
    'wait-for-selector': selector
  })
}

async function readOuterWxml(selector) {
  const value = await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'outerWxml',
    selector,
    'wait-for-selector': selector
  })
  return String(value || '')
}

async function waitForOuterWxml(selector, expectedValue) {
  return retry(`${selector} WXML containing ${expectedValue}`, async () =>
    (await readOuterWxml(selector)).includes(expectedValue) ? true : null
  )
}

async function readReviewPictogramId() {
  const outerWxml = await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'outerWxml',
    selector: '.review-row',
    'wait-for-selector': '.review-row'
  })
  const match = String(outerWxml || '').match(
    /\bid="review-pictogram-([^"]+)"/
  )
  return match && match[1] !== 'missing' ? match[1] : ''
}

async function readCorrectionMemoryProbeId() {
  const outerWxml = await invokeTool('automation_element_action', {
    project: projectPath,
    action: 'outerWxml',
    selector: '.correction-learning',
    'wait-for-selector': '.correction-learning'
  })
  const match = String(outerWxml || '').match(
    /\bid="(receiver-correction-memory-[^"]+)"/
  )
  return match ? match[1] : ''
}

async function waitForProperty(selector, name, expectedValue) {
  return retry(`${selector}.${name} = ${expectedValue}`, async () =>
    (await readProperty(selector, name)) === expectedValue ? true : null
  )
}

async function navigate(action, url) {
  await invokeTool('automation_navigate', {
    project: projectPath,
    action,
    url
  })
}

async function waitForCurrentPage(expectedRoute) {
  return retry(`current page ${expectedRoute}`, async () => {
    const result = await invokeTool('automation_runtime_info', {
      project: projectPath,
      action: 'currentPage'
    })
    return result?.success && result.currentPage?.route === expectedRoute
      ? result.currentPage
      : null
  })
}

async function callWx(method, args = []) {
  const options = {
    project: projectPath,
    action: 'call',
    method
  }
  if (args.length) options.args = args
  const result = await invokeTool('automation_wx_api', options)
  if (!result?.success) {
    throw new Error(`${method} failed: ${JSON.stringify(result)}`)
  }
  return result.result
}

async function evaluateWx(functionSource, args = []) {
  const options = {
    project: projectPath,
    'fn-source': functionSource
  }
  if (args.length) options.args = args
  const response = await invokeTool('automation_evaluate', options)
  if (!response?.success) {
    throw new Error(`wx evaluate failed: ${JSON.stringify(response)}`)
  }
  return response.result?.result
}

async function createWechatTempPersonalImage() {
  const result = await evaluateWx(
    `function() { return new Promise(function(resolve) { var fs = wx.getFileSystemManager(); var sourcePath = wx.env.USER_DATA_PATH + '/cboard-personal-image-e2e-source.png'; try { fs.unlinkSync(sourcePath); } catch (error) {} fs.writeFileSync(sourcePath, '${PERSONAL_IMAGE_TEST_PNG}', 'base64'); wx.compressImage({ src: sourcePath, quality: 80, success: function(value) { try { fs.unlinkSync(sourcePath); } catch (error) {} resolve({ status: 'success', tempFilePath: value.tempFilePath }); }, fail: function(error) { try { fs.unlinkSync(sourcePath); } catch (cleanupError) {} resolve({ status: 'fail', error: error }); } }); }); }`
  )
  if (result?.status !== 'success' || !result.tempFilePath) {
    throw new Error(
      `wx.compressImage failed: ${JSON.stringify(result)}`
    )
  }
  return String(result.tempFilePath)
}

async function snapshotPictureLibraryFiles() {
  return evaluateWx(
    `function(slotKey) { var fs = wx.getFileSystemManager(); var root = wx.env.USER_DATA_PATH + '/picture-library'; var result = { activeSlot: String(wx.getStorageSync(slotKey) || ''), a: { exists: false, data: '' }, b: { exists: false, data: '' } }; ['a', 'b'].forEach(function(slot) { var filePath = root + '/boards-' + slot + '.json'; try { result[slot] = { exists: true, data: fs.readFileSync(filePath, 'base64') }; } catch (error) {} }); return result; }`,
    [PICTURE_LIBRARY_FILE_SLOT_KEY]
  )
}

async function restorePictureLibraryFiles(snapshot, fixturePath = '') {
  await evaluateWx(
    `function(slotKey, snapshot, fixturePath) { var fs = wx.getFileSystemManager(); var root = wx.env.USER_DATA_PATH + '/picture-library'; try { fs.mkdirSync(root, true); } catch (error) {} ['a', 'b'].forEach(function(slot) { var filePath = root + '/boards-' + slot + '.json'; try { fs.unlinkSync(filePath); } catch (error) {} if (snapshot && snapshot[slot] && snapshot[slot].exists) fs.writeFileSync(filePath, snapshot[slot].data, 'base64'); }); if (snapshot && (snapshot.activeSlot === 'a' || snapshot.activeSlot === 'b')) wx.setStorageSync(slotKey, snapshot.activeSlot); else wx.removeStorageSync(slotKey); if (fixturePath) { try { fs.unlinkSync(fixturePath); } catch (error) {} } return true; }`,
    [PICTURE_LIBRARY_FILE_SLOT_KEY, snapshot, fixturePath]
  )
  assert.deepEqual(
    await snapshotPictureLibraryFiles(),
    snapshot,
    'WeChat picture-library files must be restored after AAC import E2E'
  )
}

function createReducedDefaultBoardFixtureBoards() {
  return JSON.parse(
    readFileSync(
      path.join(
        projectPath,
        'src',
        'generated',
        'cboardDefaultBoards.json'
      ),
      'utf8'
    )
  ).filter(board =>
    [HOME_BOARD_ID, QUICK_CHAT_BOARD_ID].includes(board.id)
  )
}

function createPersonalCardCopyFixtureBoards() {
  const boards = createReducedDefaultBoardFixtureBoards()
  const sourceBoard = boards.find(
    board => board.id === QUICK_CHAT_BOARD_ID
  )
  assert.ok(sourceBoard, 'the fixture source board must exist')
  sourceBoard.tiles.push({
    id: PERSONAL_CARD_COPY_SOURCE_TILE_ID,
    label: PERSONAL_CARD_COPY_LABEL,
    vocalization: PERSONAL_CARD_COPY_LABEL,
    image: YES_DEFAULT_IMAGE,
    sound: '',
    backgroundColor: '#fff176',
    loadBoard: '',
    communicationSynonyms: '共享图卡,跨板图卡',
    communicationCategory: '测试',
    pictogramAttribution: {
      provider: 'device-private',
      originalId: `${QUICK_CHAT_BOARD_ID}:${PERSONAL_CARD_COPY_SOURCE_TILE_ID}`,
      name: PERSONAL_CARD_COPY_LABEL,
      license: '用户提供，仅限本机使用',
      licenseUrl: null,
      author: null,
      authorUrl: null,
      sourceUrl:
        `device-private://personal-image/${QUICK_CHAT_BOARD_ID}/${PERSONAL_CARD_COPY_SOURCE_TILE_ID}`,
      repoKey: null
    }
  })
  return boards
}

async function installPictureLibraryFixture(boards) {
  const result = await evaluateWx(
    `function(slotKey, legacyKey, serializedBoards) { var fs = wx.getFileSystemManager(); var root = wx.env.USER_DATA_PATH + '/picture-library'; try { fs.mkdirSync(root, true); } catch (error) {} fs.writeFileSync(root + '/boards-a.json', serializedBoards, 'utf8'); wx.setStorageSync(slotKey, 'a'); wx.removeStorageSync(legacyKey); return { slot: String(wx.getStorageSync(slotKey) || ''), count: JSON.parse(serializedBoards).length }; }`,
    [
      PICTURE_LIBRARY_FILE_SLOT_KEY,
      PICTURE_LIBRARY_STORAGE_KEY,
      JSON.stringify(boards)
    ]
  )
  assert.equal(result?.slot, 'a')
  assert.equal(result?.count, boards.length)
}

async function createWechatOpenBoardFixture() {
  const board = {
    format: 'open-board-0.1',
    id: 'picinterpreter-runtime-e2e-board-v1',
    name: AAC_IMPORT_TEST_BOARD_NAME,
    locale: 'zh-CN',
    images: [
      {
        id: 'drink-water-image',
        data: `data:image/png;base64,${PERSONAL_IMAGE_TEST_PNG}`
      }
    ],
    buttons: [
      {
        id: 'drink-water',
        label: AAC_IMPORT_TEST_TILE_LABEL,
        vocalization: AAC_IMPORT_TEST_TILE_LABEL,
        image_id: 'drink-water-image'
      }
    ],
    grid: {
      rows: 1,
      columns: 1,
      order: [['drink-water']]
    }
  }
  const result = await evaluateWx(
    `function(fileName, boardText) { var fs = wx.getFileSystemManager(); var filePath = wx.env.USER_DATA_PATH + '/' + fileName; try { fs.unlinkSync(filePath); } catch (error) {} fs.writeFileSync(filePath, boardText, 'utf8'); return { path: filePath, size: fs.statSync(filePath).size }; }`,
    [AAC_IMPORT_TEST_FILE_NAME, JSON.stringify(board)]
  )
  if (!result?.path || !result.size) {
    throw new Error(`OBF fixture creation failed: ${JSON.stringify(result)}`)
  }
  return String(result.path)
}

async function createWechatOpenBoardArchiveFixture() {
  const zip = new JSZip()
  zip.file(
    'boards/home.obf',
    JSON.stringify({
      format: 'open-board-0.1',
      id: 'picinterpreter-runtime-e2e-obz-home-v1',
      name: AAC_IMPORT_TEST_OBZ_HOME_NAME,
      grid: { rows: 1, columns: 2, order: [['water', 'more']] },
      images: [{ id: 'water-image', path: 'images/water.png' }],
      sounds: [
        {
          id: 'water-sound',
          path: 'sounds/water.wav',
          content_type: 'audio/wav'
        }
      ],
      buttons: [
        {
          id: 'water',
          label: '水',
          vocalization: AAC_IMPORT_TEST_TILE_LABEL,
          image_id: 'water-image',
          sound_id: 'water-sound'
        },
        {
          id: 'more',
          label: '更多',
          load_board: { path: 'boards/more.obf' }
        }
      ]
    })
  )
  zip.file(
    'boards/more.obf',
    JSON.stringify({
      format: 'open-board-0.1',
      id: 'picinterpreter-runtime-e2e-obz-more-v1',
      name: AAC_IMPORT_TEST_OBZ_MORE_NAME,
      buttons: [{ id: 'help', label: '帮帮我' }]
    })
  )
  zip.file(
    'images/water.png',
    Buffer.from(PERSONAL_IMAGE_TEST_PNG, 'base64')
  )
  zip.file('sounds/water.wav', Buffer.from(AAC_IMPORT_TEST_WAV, 'base64'))
  const archive = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE'
  })
  const result = await evaluateWx(
    `function(fileName, archive) { var fs = wx.getFileSystemManager(); var filePath = wx.env.USER_DATA_PATH + '/' + fileName; try { fs.unlinkSync(filePath); } catch (error) {} fs.writeFileSync(filePath, archive, 'base64'); return { path: filePath, size: fs.statSync(filePath).size }; }`,
    [AAC_IMPORT_TEST_OBZ_FILE_NAME, archive]
  )
  if (!result?.path || !result.size) {
    throw new Error(`OBZ fixture creation failed: ${JSON.stringify(result)}`)
  }
  return String(result.path)
}

async function createWechatAstericsGridFixture() {
  const grid = {
    metadata: { homeGridId: 'home' },
    grids: [
      {
        id: 'home',
        label: { en: 'Home', zh: AAC_IMPORT_TEST_GRD_HOME_NAME },
        rowCount: 1,
        minColumnCount: 2,
        gridElements: [
          {
            id: 'water',
            x: 0,
            y: 0,
            label: { en: 'Water', zh: '喝水' },
            image: {
              data: `data:image/png;base64,${PERSONAL_IMAGE_TEST_PNG}`,
              author: '图语家运行验收'
            },
            actions: [
              {
                modelName: 'GridActionSpeakCustom',
                speakText: { en: 'Drink water', zh: AAC_IMPORT_TEST_TILE_LABEL }
              }
            ]
          },
          {
            id: 'more',
            x: 1,
            y: 0,
            label: { en: 'More', zh: '更多' },
            actions: [
              { modelName: 'GridActionNavigate', toGridId: 'details' }
            ]
          }
        ]
      },
      {
        id: 'details',
        label: { en: 'Details', zh: AAC_IMPORT_TEST_GRD_MORE_NAME },
        rowCount: 1,
        minColumnCount: 1,
        gridElements: [
          {
            id: 'toilet',
            x: 0,
            y: 0,
            label: { en: 'Toilet', zh: '厕所' },
            actions: [{ modelName: 'GridActionSpeak' }]
          }
        ]
      }
    ]
  }
  const result = await evaluateWx(
    `function(fileName, gridText) { var fs = wx.getFileSystemManager(); var filePath = wx.env.USER_DATA_PATH + '/' + fileName; try { fs.unlinkSync(filePath); } catch (error) {} fs.writeFileSync(filePath, gridText, 'utf8'); return { path: filePath, size: fs.statSync(filePath).size }; }`,
    [AAC_IMPORT_TEST_GRD_FILE_NAME, JSON.stringify(grid)]
  )
  if (!result?.path || !result.size) {
    throw new Error(`GRD fixture creation failed: ${JSON.stringify(result)}`)
  }
  return String(result.path)
}

async function createWechatGridsetFixture() {
  const zip = new JSZip()
  zip.file(
    'Grids/Home/grid.xml',
    `<Grid><GridGuid>picinterpreter-runtime-e2e-gridset-v1</GridGuid><Name>${AAC_IMPORT_TEST_GRIDSET_BOARD_NAME}</Name><ColumnDefinitions><ColumnDefinition /><ColumnDefinition /></ColumnDefinitions><RowDefinitions><RowDefinition /></RowDefinitions><AutoContentCommands /><Cells><Cell X="0" Y="0"><Content><Commands><Command ID="Action.InsertText"><Parameter Key="text"><r>我想喝水</r></Parameter></Command></Commands><CaptionAndImage><Caption>喝水</Caption><Image>drink.png</Image></CaptionAndImage><Style><BackColour>#112233FF</BackColour><BorderColour>#445566FF</BorderColour></Style></Content></Cell><Cell X="1" Y="0"><Content><Commands><Command ID="Action.InsertText"><Parameter Key="text"><r>需要帮助</r></Parameter></Command></Commands><CaptionAndImage><Caption>帮助</Caption></CaptionAndImage></Content></Cell></Cells></Grid>`
  )
  zip.file(
    'Grids/Home/drink.png',
    Buffer.from(PERSONAL_IMAGE_TEST_PNG, 'base64')
  )
  const archive = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE'
  })
  const result = await evaluateWx(
    `function(fileName, archive) { var fs = wx.getFileSystemManager(); var filePath = wx.env.USER_DATA_PATH + '/' + fileName; try { fs.unlinkSync(filePath); } catch (error) {} fs.writeFileSync(filePath, archive, 'base64'); return { path: filePath, size: fs.statSync(filePath).size }; }`,
    [AAC_IMPORT_TEST_GRIDSET_FILE_NAME, archive]
  )
  if (!result?.path || !result.size) {
    throw new Error(
      `Gridset fixture creation failed: ${JSON.stringify(result)}`
    )
  }
  return String(result.path)
}

async function createWechatOpaqueAacFixture(fileName, base64Data) {
  const result = await evaluateWx(
    `function(fileName, base64Data) { var fs = wx.getFileSystemManager(); var filePath = wx.env.USER_DATA_PATH + '/' + fileName; try { fs.unlinkSync(filePath); } catch (error) {} fs.writeFileSync(filePath, base64Data, 'base64'); return { path: filePath, size: fs.statSync(filePath).size }; }`,
    [fileName, base64Data]
  )
  if (!result?.path || !result.size) {
    throw new Error(`AAC fixture creation failed: ${JSON.stringify(result)}`)
  }
  return String(result.path)
}

async function readStoredPictureLibraryBoards() {
  return evaluateWx(
    `function(slotKey, legacyKey) { var fs = wx.getFileSystemManager(); var slot = String(wx.getStorageSync(slotKey) || ''); var raw = ''; if (slot === 'a' || slot === 'b') { try { raw = fs.readFileSync(wx.env.USER_DATA_PATH + '/picture-library/boards-' + slot + '.json', 'utf8'); } catch (error) {} } if (!raw) raw = String(wx.getStorageSync(legacyKey) || '[]'); try { return JSON.parse(raw); } catch (error) { return []; } }`,
    [PICTURE_LIBRARY_FILE_SLOT_KEY, PICTURE_LIBRARY_STORAGE_KEY]
  )
}

function findPictureLibraryAssetRoot(imagePath) {
  const normalizedPath = String(imagePath || '')
  const marker = '/picture-library/'
  const markerIndex = normalizedPath.indexOf(marker)
  if (markerIndex < 0) return ''
  const suffixStart = markerIndex + marker.length
  const suffixEnd = normalizedPath.indexOf('/', suffixStart)
  if (suffixEnd < 0) return ''
  return normalizedPath.slice(0, suffixEnd)
}

function findAacImportAssetRoot(boards) {
  const importedBoard = Array.isArray(boards)
    ? boards.find(board =>
        [
          AAC_IMPORT_TEST_BOARD_NAME,
          AAC_IMPORT_TEST_OBZ_HOME_NAME,
          AAC_IMPORT_TEST_GRD_HOME_NAME,
          AAC_IMPORT_TEST_GRIDSET_BOARD_NAME
        ].includes(board.name)
      )
    : null
  return findPictureLibraryAssetRoot(importedBoard?.tiles?.[0]?.image)
}

async function inspectWechatUserFile(filePath) {
  return evaluateWx(
    `function(filePath) { var fs = wx.getFileSystemManager(); var userRoot = String(wx.env.USER_DATA_PATH || ''); var candidates = [filePath]; if (filePath.indexOf('http://usr/') === 0 && userRoot) candidates.push(userRoot + filePath.slice('http://usr'.length)); if (filePath.indexOf('wxfile://usr/') === 0 && userRoot) candidates.push(userRoot + filePath.slice('wxfile://usr'.length)); for (var index = 0; index < candidates.length; index += 1) { try { var stat = fs.statSync(candidates[index]); return { exists: true, size: stat.size, path: candidates[index] }; } catch (error) {} } return { exists: false, size: 0, path: '' }; }`,
    [filePath]
  )
}

async function removePictureLibraryAssetRoot(rootPath) {
  if (!rootPath) return
  const result = await evaluateWx(
    `function(rootPath) { var fs = wx.getFileSystemManager(); var prefix = wx.env.USER_DATA_PATH + '/picture-library/'; if (rootPath.indexOf(prefix) !== 0 || rootPath.slice(prefix.length).indexOf('/') >= 0) return { removed: false, reason: 'unsafe-root' }; try { fs.rmdirSync(rootPath, true); return { removed: true }; } catch (error) { return { removed: false, reason: String(error && error.message || error) }; } }`,
    [rootPath]
  )
  if (!result?.removed) {
    throw new Error(`Picture-library asset cleanup failed: ${JSON.stringify(result)}`)
  }
}

async function listAacUploadTempFiles() {
  return evaluateWx(
    `function() { var fs = wx.getFileSystemManager(); try { return fs.readdirSync(wx.env.USER_DATA_PATH).filter(function(name) { return name.indexOf('aac-import-') === 0; }).sort(); } catch (error) { return []; } }`
  )
}

function isCommunicationLogFileName(fileName) {
  if (typeof fileName !== 'string' || fileName.includes('/') || fileName.includes('\\')) {
    return false
  }
  return (
    (fileName.startsWith(STANDARD_COMMUNICATION_LOG_PREFIX) &&
      fileName.endsWith('.obl')) ||
    (fileName.startsWith(ANONYMIZED_COMMUNICATION_LOG_PREFIX) &&
      fileName.endsWith('.obla'))
  )
}

async function listCommunicationLogFiles() {
  return evaluateWx(
    `function(standardPrefix, anonymizedPrefix) { var fs = wx.getFileSystemManager(); try { return fs.readdirSync(wx.env.USER_DATA_PATH).filter(function(name) { return (name.indexOf(standardPrefix) === 0 && name.slice(-4) === '.obl') || (name.indexOf(anonymizedPrefix) === 0 && name.slice(-5) === '.obla'); }).sort(); } catch (error) { return []; } }`,
    [STANDARD_COMMUNICATION_LOG_PREFIX, ANONYMIZED_COMMUNICATION_LOG_PREFIX]
  )
}

function isPictureLibraryBackupFileName(fileName) {
  return (
    typeof fileName === 'string' &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    fileName.startsWith(PICTURE_LIBRARY_BACKUP_PREFIX) &&
    fileName.endsWith('.zip')
  )
}

async function listPictureLibraryBackupFiles() {
  return evaluateWx(
    `function(prefix) { var fs = wx.getFileSystemManager(); try { return fs.readdirSync(wx.env.USER_DATA_PATH).filter(function(name) { return name.indexOf(prefix) === 0 && name.slice(-4) === '.zip'; }).sort(); } catch (error) { return []; } }`,
    [PICTURE_LIBRARY_BACKUP_PREFIX]
  )
}

async function readPictureLibraryBackupFile(fileName) {
  assert.ok(
    isPictureLibraryBackupFileName(fileName),
    `refusing to read an unexpected picture-library backup: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { return wx.getFileSystemManager().readFileSync(wx.env.USER_DATA_PATH + '/' + fileName, 'base64'); }`,
    [fileName]
  )
}

async function getPictureLibraryBackupFilePath(fileName) {
  assert.ok(
    isPictureLibraryBackupFileName(fileName),
    `refusing to resolve an unexpected picture-library backup: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { return wx.env.USER_DATA_PATH + '/' + fileName; }`,
    [fileName]
  )
}

async function removePictureLibraryBackupFile(fileName) {
  assert.ok(
    isPictureLibraryBackupFileName(fileName),
    `refusing to remove an unexpected picture-library backup: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { var fs = wx.getFileSystemManager(); try { fs.unlinkSync(wx.env.USER_DATA_PATH + '/' + fileName); return true; } catch (error) { return false; } }`,
    [fileName]
  )
}

function isLocalDeviceDataBackupFileName(fileName) {
  return (
    typeof fileName === 'string' &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    fileName.startsWith(LOCAL_DEVICE_DATA_BACKUP_PREFIX) &&
    fileName.endsWith('.zip')
  )
}

async function listLocalDeviceDataBackupFiles() {
  return evaluateWx(
    `function(prefix) { var fs = wx.getFileSystemManager(); try { return fs.readdirSync(wx.env.USER_DATA_PATH).filter(function(name) { return name.indexOf(prefix) === 0 && name.slice(-4) === '.zip'; }).sort(); } catch (error) { return []; } }`,
    [LOCAL_DEVICE_DATA_BACKUP_PREFIX]
  )
}

async function readLocalDeviceDataBackupFile(fileName) {
  assert.ok(
    isLocalDeviceDataBackupFileName(fileName),
    `refusing to read an unexpected local-device backup: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { return wx.getFileSystemManager().readFileSync(wx.env.USER_DATA_PATH + '/' + fileName, 'base64'); }`,
    [fileName]
  )
}

async function getLocalDeviceDataBackupFilePath(fileName) {
  assert.ok(
    isLocalDeviceDataBackupFileName(fileName),
    `refusing to resolve an unexpected local-device backup: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { return wx.env.USER_DATA_PATH + '/' + fileName; }`,
    [fileName]
  )
}

async function removeLocalDeviceDataBackupFile(fileName) {
  assert.ok(
    isLocalDeviceDataBackupFileName(fileName),
    `refusing to remove an unexpected local-device backup: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { var fs = wx.getFileSystemManager(); try { fs.unlinkSync(wx.env.USER_DATA_PATH + '/' + fileName); return true; } catch (error) { return false; } }`,
    [fileName]
  )
}

async function readCommunicationLogFile(fileName) {
  assert.ok(
    isCommunicationLogFileName(fileName),
    `refusing to read an unexpected communication log file: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { return wx.getFileSystemManager().readFileSync(wx.env.USER_DATA_PATH + '/' + fileName, 'utf8'); }`,
    [fileName]
  )
}

async function removeCommunicationLogFile(fileName) {
  assert.ok(
    isCommunicationLogFileName(fileName),
    `refusing to remove an unexpected communication log file: ${fileName}`
  )
  return evaluateWx(
    `function(fileName) { var fs = wx.getFileSystemManager(); var filePath = wx.env.USER_DATA_PATH + '/' + fileName; try { fs.unlinkSync(filePath); return true; } catch (error) { return false; } }`,
    [fileName]
  )
}

async function mockServerAacUpload({ format, boardName, label }) {
  const payload = {
    format: 'picinterpreter-aac-conversion',
    contractVersion: 1,
    sourceFormat: format,
    warnings: [],
    documents: [
      {
        path: `boards/${format}-home.obf`,
        board: {
          format: 'open-board-0.1',
          id: `${format}-runtime-e2e-home`,
          name: boardName,
          buttons: [
            { id: 'message', label, vocalization: label }
          ]
        }
      }
    ]
  }
  await mockWx(
    'uploadFile',
    {
      statusCode: 200,
      data: JSON.stringify(payload),
      errMsg: 'uploadFile:ok'
    }
  )
}

async function inspectWechatSavedFile(filePath) {
  return evaluateWx(
    `function(filePath) { return new Promise(function(resolve) { wx.getSavedFileInfo({ filePath: filePath, success: function(value) { resolve({ exists: true, value: value }); }, fail: function(error) { resolve({ exists: false, error: error }); } }); }); }`,
    [filePath]
  )
}

async function removeWechatSavedFile(filePath) {
  return evaluateWx(
    `function(filePath) { return new Promise(function(resolve) { wx.removeSavedFile({ filePath: filePath, complete: function(value) { resolve(value); } }); }); }`,
    [filePath]
  )
}

function createCallbackWxMock(resultExpression) {
  return `function(options) { var result = ${resultExpression}; if (options && typeof options.success === 'function') options.success(result); if (options && typeof options.complete === 'function') options.complete(result); return result; }`
}

async function mockWx(method, definition) {
  const options = {
    project: projectPath,
    action: 'mock',
    method
  }
  if (typeof definition === 'string') {
    options['function-declaration'] = definition
      .split(/\r?\n/)
      .map(line => line.trim())
      .join(' ')
  } else {
    options.result = definition
  }
  const response = await invokeTool('automation_wx_api', options)
  if (!response?.success) {
    throw new Error(`${method} mock failed: ${JSON.stringify(response)}`)
  }
  mockedWxMethods.add(method)
}

async function restoreWxMocks() {
  const failures = []
  for (const method of [...mockedWxMethods].reverse()) {
    try {
      const response = await invokeTool('automation_wx_api', {
        project: projectPath,
        action: 'restore',
        method
      })
      if (!response?.success) {
        throw new Error(JSON.stringify(response))
      }
      mockedWxMethods.delete(method)
    } catch (error) {
      failures.push(`${method}: ${error.message}`)
    }
  }
  if (failures.length) {
    throw new Error(`wx API mock restore failed: ${failures.join(', ')}`)
  }
}

async function readAccountRequestLog() {
  if (!accountFakeApiControlUrl) {
    const requestLog = await callWx('getStorageSync', [
      ACCOUNT_REQUEST_LOG_STORAGE_KEY
    ])
    return Array.isArray(requestLog) ? requestLog : []
  }

  const response = await fetch(
    `${accountFakeApiControlUrl}/__e2e/requests`
  )
  if (!response.ok) {
    throw new Error(
      `Fake API request log failed with status ${response.status}`
    )
  }
  const payload = await response.json()
  return Array.isArray(payload.requests) ? payload.requests : []
}

async function snapshotStorage() {
  const info = await callWx('getStorageInfoSync')
  const keys = Array.isArray(info?.keys) ? info.keys : []
  const entries = []
  for (const key of keys) {
    entries.push([key, await callWx('getStorageSync', [key])])
  }
  return entries
}

async function isolateStorage() {
  for (const [key, value] of isolatedStorageEntries) {
    await callWx('setStorageSync', [key, value])
  }
  for (const key of isolatedStorageKeysToRemove) {
    await callWx('removeStorageSync', [key])
  }
}

async function restoreStorage(entries) {
  const currentInfo = await callWx('getStorageInfoSync')
  const currentKeys = Array.isArray(currentInfo?.keys)
    ? currentInfo.keys
    : []
  for (const key of currentKeys) {
    await callWx('removeStorageSync', [key])
  }
  for (const [key, value] of entries) {
    await callWx('setStorageSync', [key, value])
  }

  const restored = await snapshotStorage()
  assert.deepEqual(
    new Map(restored),
    new Map(entries),
    'WeChat storage must be restored after E2E'
  )
}

function persistStorageRecovery(entries) {
  assert.equal(
    existsSync(storageRecoveryFile),
    false,
    `pending storage recovery must be handled first: ${storageRecoveryFile}`
  )
  mkdirSync(tempDirectory, { recursive: true })
  const temporaryPath = `${storageRecoveryFile}.tmp-${process.pid}`
  const document = createStorageRecoveryDocument({
    projectPath,
    entries
  })
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8'
  )
  renameSync(temporaryPath, storageRecoveryFile)
}

function readStorageRecovery() {
  assert.ok(
    existsSync(storageRecoveryFile),
    `storage recovery file was not found: ${storageRecoveryFile}`
  )
  return parseStorageRecoveryDocument(
    readFileSync(storageRecoveryFile, 'utf8'),
    projectPath
  )
}

function removeStorageRecovery() {
  rmSync(storageRecoveryFile, { force: true })
}

async function ensureCaregiverToolsVisible() {
  if ((await queryElements('#history-manager-button')).length) return
  await tap('#caregiver-tools-toggle')
  await waitForSelector('#history-manager-button')
}

async function openPersonalImageLibraryFromCaregiverSettings() {
  await ensureCaregiverToolsVisible()
  await tap('#communication-settings-button')
  await waitForSelector('.communication-settings-panel')
  await tap('#open-picture-library-management-button')
  await waitForSelector('.personal-image-search')
}

async function openPictureLibraryBackupFromCaregiverSettings() {
  await ensureCaregiverToolsVisible()
  await tap('#communication-settings-button')
  await waitForSelector('.communication-settings-panel')
  await tap('#open-picture-library-backup-button')
  await waitForSelector('.library-backup-page')
}

async function openAacImportFromCaregiverSettings() {
  await openPictureLibraryBackupFromCaregiverSettings()
  await tap('#open-aac-import-page-button')
  await waitForSelector('.aac-import-page')
}

async function readJsonStorage(key) {
  const raw = await callWx('getStorageSync', [key])
  if (raw && typeof raw === 'object') return raw
  assert.equal(
    typeof raw,
    'string',
    `${key} must be stored as JSON text`
  )
  return JSON.parse(raw)
}

function extractOrderedIds(wxml, prefix) {
  const pattern = new RegExp(`\\bid="${prefix}([^"]+)"`, 'g')
  return Array.from(String(wxml || '').matchAll(pattern), match => match[1])
}

function findElementIdByContent(wxml, tagName, requiredValues) {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    'g'
  )
  for (const match of String(wxml || '').matchAll(pattern)) {
    if (!requiredValues.every(value => match[2].includes(value))) continue
    const idMatch = match[1].match(/\bid="([^"]+)"/)
    if (idMatch) return idMatch[1]
  }
  return ''
}

async function readExpressionTileOrder() {
  return extractOrderedIds(await readOuterWxml('.tile-grid'), 'expression-tile-')
}

async function readManualPictogramOrder() {
  return extractOrderedIds(
    await readOuterWxml('.manual-order__list'),
    'manual-order-up-'
  )
}

function assertLeadingOrder(actual, expected, message) {
  assert.deepEqual(actual.slice(0, expected.length), expected, message)
}

async function openCommunicationSettings() {
  await ensureCaregiverToolsVisible()
  await tap('#communication-settings-button')
  await waitForSelector('.communication-settings-panel')
}

async function closeCommunicationSettings() {
  await tap('.utility-page__back')
  await waitForCurrentPage(PATIENT_PAGE_ROUTE)
  await waitForSelector('.communication-page')
}

async function verifyPictogramOrderingScenario() {
  step('verifying fixed manual order in caregiver settings')
  await openCommunicationSettings()
  assertLeadingOrder(
    await readManualPictogramOrder(),
    [YES_TILE_ID, NO_TILE_ID],
    'the default caregiver order must start with 是、不'
  )

  await tap(`#manual-order-down-${YES_TILE_ID}`)
  await retry('the manual order to persist 是 below 不', async () => {
    const ordering = await readJsonStorage(PICTOGRAM_ORDERING_STORAGE_KEY)
    return ordering.manualOrderByBoard?.[HOME_BOARD_ID]?.slice(0, 2)
      .join(',') === `${NO_TILE_ID},${YES_TILE_ID}`
      ? ordering
      : null
  })
  assertLeadingOrder(
    await readManualPictogramOrder(),
    [NO_TILE_ID, YES_TILE_ID],
    'the caregiver list must reflect the saved manual move immediately'
  )

  await closeCommunicationSettings()
  assertLeadingOrder(
    await readExpressionTileOrder(),
    [NO_TILE_ID, YES_TILE_ID, FIRST_HOME_FOLDER_TILE_ID],
    'manual mode must move only leaf pictograms and preserve the first folder position'
  )

  step('recording a real patient tile use')
  await tap(`#expression-tile-${YES_TILE_ID}`)
  await waitForText('.candidate__sentence', YES_TILE_LABEL)
  await retry('the patient tile usage count to persist', async () => {
    const ordering = await readJsonStorage(PICTOGRAM_ORDERING_STORAGE_KEY)
    return ordering.usageByTileKey?.[`${HOME_BOARD_ID}:${YES_TILE_ID}`]
      ?.count === 1
      ? ordering
      : null
  })

  step('switching to popularity order and preserving folder positions')
  await openCommunicationSettings()
  await tap('#pictogram-sort-popularity')
  await retry('the popularity preference to persist', async () => {
    const preferences = await readJsonStorage(
      'cboard_communication_preferences'
    )
    return preferences.pictogramSortMode === 'popularity'
      ? preferences
      : null
  })
  await closeCommunicationSettings()
  assertLeadingOrder(
    await readExpressionTileOrder(),
    [YES_TILE_ID, NO_TILE_ID, FIRST_HOME_FOLDER_TILE_ID],
    'popularity mode must promote the used leaf without moving folders'
  )

  step('restoring popularity order after page reconstruction')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  assertLeadingOrder(
    await readExpressionTileOrder(),
    [YES_TILE_ID, NO_TILE_ID, FIRST_HOME_FOLDER_TILE_ID],
    'popularity order must survive a page reconstruction'
  )
  const reconstructedOrdering = await readJsonStorage(
    PICTOGRAM_ORDERING_STORAGE_KEY
  )
  assertLeadingOrder(
    reconstructedOrdering.manualOrderByBoard[HOME_BOARD_ID],
    [NO_TILE_ID, YES_TILE_ID],
    'popularity mode must not overwrite the caregiver manual order'
  )
  assert.equal(
    reconstructedOrdering.usageByTileKey[`${HOME_BOARD_ID}:${YES_TILE_ID}`]
      .count,
    1,
    'patient usage count must survive a page reconstruction'
  )

  step('switching back to the exact saved manual order')
  await openCommunicationSettings()
  await tap('#pictogram-sort-manual')
  await closeCommunicationSettings()
  assertLeadingOrder(
    await readExpressionTileOrder(),
    [NO_TILE_ID, YES_TILE_ID, FIRST_HOME_FOLDER_TILE_ID],
    'manual mode must restore the exact caregiver order'
  )

  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  assertLeadingOrder(
    await readExpressionTileOrder(),
    [NO_TILE_ID, YES_TILE_ID, FIRST_HOME_FOLDER_TILE_ID],
    'the restored manual order must survive a second reconstruction'
  )
  const finalPreferences = await readJsonStorage(
    'cboard_communication_preferences'
  )
  assert.equal(
    finalPreferences.pictogramSortMode,
    'manual',
    'the final fixed-order preference must persist'
  )
}

async function verifyCandidateFeedbackScenario() {
  if ((await queryElements('.expression-chip')).length) {
    await tap('#expression-clear-button')
    await waitForNoSelector('.expression-chip')
  }

  step('saving and replacing an unconfirmed candidate feedback draft')
  await tap(`#expression-tile-${YES_TILE_ID}`)
  await waitForText('.candidate__sentence', YES_TILE_LABEL)
  await tap('#expression-candidate-0-feedback-up')
  const initialDraft = await retry(
    'helpful candidate feedback draft persistence',
    async () => {
      const drafts = await readJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY)
      return drafts.length === 1 &&
        drafts[0].candidates?.[0]?.feedback === 'up'
        ? drafts[0]
        : null
    }
  )
  assert.ok(
    (await readOuterWxml('#expression-candidate-0-feedback-up')).includes(
      'candidate-feedback__button--active'
    ),
    'the helpful button must reflect the persisted draft immediately'
  )

  await tap('#expression-candidate-0-feedback-down')
  const replacedDraft = await retry(
    'candidate feedback replacement persistence',
    async () => {
      const drafts = await readJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY)
      return drafts.length === 1 &&
        drafts[0].id === initialDraft.id &&
        drafts[0].candidates?.[0]?.feedback === 'down'
        ? drafts[0]
        : null
    }
  )
  assert.equal(replacedDraft.id, initialDraft.id)
  assert.ok(
    (await readOuterWxml('#expression-candidate-0-feedback-down')).includes(
      'candidate-feedback__button--active'
    ),
    'the replacement button must become active without creating a new draft'
  )

  step('cancelling the feedback and removing its local draft')
  await tap('#expression-candidate-0-feedback-down')
  await retry('candidate feedback draft removal', async () => {
    const drafts = await readJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY)
    return drafts.length === 0 ? drafts : null
  })
  await waitForText('.candidate-feedback__notice', '已取消这条反馈')

  step('confirming helpful feedback into communication history')
  await tap('#expression-candidate-0-feedback-up')
  const confirmedDraft = await retry(
    'replacement candidate feedback draft persistence',
    async () => {
      const drafts = await readJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY)
      return drafts.length === 1 &&
        drafts[0].candidates?.[0]?.feedback === 'up'
        ? drafts[0]
        : null
    }
  )
  await tap('#expression-confirm-button')
  await waitForText('#expression-status-notice', '表达已确认')
  await retry('confirmed candidate feedback history persistence', async () => {
    const drafts = await readJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY)
    const history = await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY)
    const item = history.find(entry => entry.id === confirmedDraft.id)
    return drafts.length === 0 &&
      item?.recordStatus === 'confirmed' &&
      item.candidates?.[0]?.feedback === 'up'
      ? item
      : null
  })

  step('reviewing and replacing confirmed feedback after reconstruction')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await ensureCaregiverToolsVisible()
  await tap('#history-manager-button')
  await waitForSelector('.history-manager')
  const historyUpSelector =
    `#history-candidate-${confirmedDraft.id}-0-up`
  const historyDownSelector =
    `#history-candidate-${confirmedDraft.id}-0-down`
  await waitForSelector(historyUpSelector)
  assert.ok(
    (await readOuterWxml(historyUpSelector)).includes(
      'candidate-feedback__button--active'
    ),
    'confirmed helpful feedback must be active in reconstructed history'
  )

  await tap(historyDownSelector)
  await retry('confirmed history feedback replacement', async () => {
    const history = await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY)
    const item = history.find(entry => entry.id === confirmedDraft.id)
    return item?.candidates?.[0]?.feedback === 'down' ? item : null
  })

  await navigate(
    'reLaunch',
    '/packages/management/pages/index/index?view=history'
  )
  await waitForSelector('.history-manager')
  assert.ok(
    (await readOuterWxml(historyDownSelector)).includes(
      'candidate-feedback__button--active'
    ),
    'replaced history feedback must survive a second reconstruction'
  )
}

async function toggleQuickChatBoardVisibility(expectedActionText) {
  const boardOptionsWxml = await readOuterWxml(
    '.settings-options--boards'
  )
  const actionId = findElementIdByContent(
    boardOptionsWxml,
    'button',
    [expectedActionText]
  )
  assert.ok(
    actionId,
    `the board settings must expose ${expectedActionText}`
  )
  await tap(`#${actionId}`)
}

async function verifyBoardVisibilityScenario() {
  step('verifying the default quick-chat folder is patient-visible')
  await waitForSelector(`#expression-tile-${FIRST_HOME_FOLDER_TILE_ID}`)

  step('hiding the quick-chat board through caregiver settings')
  await openCommunicationSettings()
  await toggleQuickChatBoardVisibility(
    `隐藏 ${QUICK_CHAT_BOARD_NAME}`
  )
  await waitForOuterWxml(
    '.settings-options--boards',
    `恢复 ${QUICK_CHAT_BOARD_NAME}`
  )
  const hiddenPreferences = await retry(
    'the hidden board preference to persist',
    async () => {
      const preferences = await readJsonStorage(
        'cboard_communication_preferences'
      )
      return preferences.hiddenBoardIds?.includes(QUICK_CHAT_BOARD_ID)
        ? preferences
        : null
    }
  )
  assert.deepEqual(hiddenPreferences.hiddenBoardIds, [QUICK_CHAT_BOARD_ID])
  await closeCommunicationSettings()
  await waitForNoSelector(`#expression-tile-${FIRST_HOME_FOLDER_TILE_ID}`)
  await waitForSelector(`#expression-tile-${YES_TILE_ID}`)
  step('hidden-board patient projection removed the folder while preserving leaf tiles')

  step('reconstructing the patient page with the board still hidden')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForNoSelector(`#expression-tile-${FIRST_HOME_FOLDER_TILE_ID}`)
  await waitForSelector(`#expression-tile-${YES_TILE_ID}`)

  step('restoring the board and its patient navigation folder')
  await openCommunicationSettings()
  await toggleQuickChatBoardVisibility(
    `恢复 ${QUICK_CHAT_BOARD_NAME}`
  )
  await waitForOuterWxml(
    '.settings-options--boards',
    `隐藏 ${QUICK_CHAT_BOARD_NAME}`
  )
  const restoredPreferences = await retry(
    'the restored board preference to persist',
    async () => {
      const preferences = await readJsonStorage(
        'cboard_communication_preferences'
      )
      return Array.isArray(preferences.hiddenBoardIds) &&
        preferences.hiddenBoardIds.length === 0
        ? preferences
        : null
    }
  )
  assert.deepEqual(restoredPreferences.hiddenBoardIds, [])
  await closeCommunicationSettings()
  await waitForSelector(`#expression-tile-${FIRST_HOME_FOLDER_TILE_ID}`)

  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForSelector(`#expression-tile-${FIRST_HOME_FOLDER_TILE_ID}`)
}

async function verifyCaregiverPictureLibraryPlacementScenario() {
  step('verifying cross-category search is absent from the patient page')
  await waitForCurrentPage(PATIENT_PAGE_ROUTE)
  assert.equal(
    (await queryElements('#personal-image-library-search')).length,
    0,
    'the patient page must not expose caregiver picture-library search'
  )
  assert.equal(
    (await readOuterWxml('.communication-page')).includes('跨分类找图'),
    false,
    'caregiver library wording must stay out of the patient workspace'
  )

  step('opening picture-library maintenance through caregiver settings')
  await openPersonalImageLibraryFromCaregiverSettings()
  await waitForCurrentPage(PICTURE_LIBRARY_PAGE_ROUTE)
  await waitForSelector('#personal-image-library-search')
  const libraryWxml = await readOuterWxml('.personal-image-manager')
  assert.ok(
    libraryWxml.includes('公开图卡收纳') &&
      libraryWxml.includes('跨分类找图并收纳'),
    'picture-library maintenance must expose curation and cross-category search'
  )

  step('searching the real CBoard catalog across categories')
  await input('#personal-image-library-search', '叉子')
  const matchingCard = await retry(
    'a cross-category CBoard pictogram result',
    async () => {
      const cards = await queryElements('.personal-image-card')
      if (!cards.length) return null
      const cardWxml = await readOuterWxml('.personal-image-card')
      return cardWxml.includes('叉子') ? cardWxml : null
    }
  )
  assert.ok(matchingCard.includes('叉子'))
}

async function verifyAdultCareDefaultBoardsScenario() {
  step('verifying adult-care leaf actions on the production patient home board')
  await waitForCurrentPage(PATIENT_PAGE_ROUTE)
  const directTileIds = [
    'pi-home-want',
    'pi-home-dont-want',
    'pi-home-help',
    'pi-home-stop',
    'pi-home-repeat',
    'pi-home-pain',
    'pi-home-uncomfortable',
    'pi-home-drink-water',
    'pi-home-toilet',
    ADULT_CARE_CALL_DOCTOR_TILE_ID,
    'pi-home-call-family'
  ]
  for (const tileId of directTileIds) {
    await waitForSelector(`#expression-tile-${tileId}`)
  }

  step('opening and using the shared core-word board')
  await tap(`#expression-tile-${ADULT_CARE_CORE_FOLDER_TILE_ID}`)
  await waitForText('.board-section-heading__title', '核心词')
  await waitForSelector('#expression-tile-pi-core-i')
  await waitForSelector('#expression-tile-pi-core-why')
  assert.equal(
    (await queryElements('.tile-grid .tile-button')).length,
    15,
    'the production core-word board must expose all 15 curated tiles'
  )
  await tap('#expression-tile-pi-core-i')
  await waitForText('.expression-chip', '我')

  step('opening and using the communication-repair board')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector(`#expression-tile-${ADULT_CARE_REPAIR_FOLDER_TILE_ID}`)
  await tap(`#expression-tile-${ADULT_CARE_REPAIR_FOLDER_TILE_ID}`)
  await waitForText('.board-section-heading__title', '修正澄清')
  await waitForSelector('#expression-tile-pi-repair-wrong')
  await waitForSelector('#expression-tile-pi-repair-cannot-speak')
  assert.equal(
    (await queryElements('.tile-grid .tile-button')).length,
    9,
    'the production repair board must expose all 9 curated tiles'
  )
  await tap('#expression-tile-pi-repair-wrong')
  await waitForText('.expression-chip', '不对')

  step('verifying the high-risk negation question in the caregiver receiver')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('#receiver-mode-button')
  await tap('#receiver-mode-button')
  await waitForSelector('#receiver-input')
  await input('#receiver-input', '要不要叫医生')
  await tap('#receiver-generate-button')
  await waitForSelector(
    `#review-pictogram-${ADULT_CARE_CALL_DOCTOR_TILE_ID}`
  )
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    1,
    'the negation question must not add 要 or 不要 pictograms'
  )
  await waitForText('.receiver-preview__label', '请叫医生')
  assert.equal(
    (await queryElements('#review-pictogram-pi-home-want')).length,
    0
  )
  assert.equal(
    (await queryElements('#review-pictogram-pi-home-dont-want')).length,
    0
  )
  assert.equal(
    (await queryElements('#review-pictogram-pi-core-want')).length,
    0
  )

  step('confirming the same curated doctor pictogram and its attribution')
  await input('#receiver-input', '叫医生')
  await tap('#receiver-generate-button')
  await waitForText('.quality-banner__count', '1/1')
  await waitForText('.quality-banner__title', '图片序列可以使用')
  await tap('#receiver-open-display-button')
  await waitForSelector('.receiver-display-page')
  await waitForText('#receiver-display-attribution', 'ARASAAC')
  await waitForText('#receiver-display-attribution', 'CC BY-NC-SA 4.0')
}

async function verifyOnboardingAccessibilityScenario() {
  step('forcing the shared first-use preference without clearing other data')
  const initialPreferences = await readJsonStorage(
    'cboard_communication_preferences'
  )
  await callWx('setStorageSync', [
    'cboard_communication_preferences',
    JSON.stringify({
      ...initialPreferences,
      highContrast: false,
      fontSize: 'normal',
      gridColumns: 3,
      onboardingComplete: false
    })
  ])
  await navigate('reLaunch', '/pages/index/index')

  step('completing the shared first-use onboarding through production UI')
  await waitForSelector('.communication-onboarding')
  assert.equal(
    (await queryElements('.communication-onboarding__step')).length,
    3,
    'onboarding must expose the three shared core steps'
  )
  await waitForText('.communication-onboarding__eyebrow', '第一次使用')
  await tap('#complete-communication-onboarding-button')
  await waitForSelector('.communication-page')
  const completedPreferences = await retry(
    'the onboarding completion to persist',
    async () => {
      const preferences = await readJsonStorage(
        'cboard_communication_preferences'
      )
      return preferences.onboardingComplete ? preferences : null
    }
  )
  assert.equal(completedPreferences.highContrast, false)

  step('applying high contrast, extra-large type, and a two-column grid')
  await openCommunicationSettings()
  await tap('#accessibility-high-contrast-toggle')
  await tap('#accessibility-font-extra-large')
  await tap('#accessibility-grid-2')
  const accessiblePreferences = await retry(
    'the accessibility preferences to persist',
    async () => {
      const preferences = await readJsonStorage(
        'cboard_communication_preferences'
      )
      return preferences.highContrast === true &&
        preferences.fontSize === 'extra-large' &&
        preferences.gridColumns === 2
        ? preferences
        : null
    }
  )
  assert.equal(accessiblePreferences.onboardingComplete, true)
  await closeCommunicationSettings()
  await waitForOuterWxml(
    '.communication-page',
    'communication-page--high-contrast'
  )
  await waitForOuterWxml(
    '.communication-page',
    'communication-page--font-extra-large'
  )
  await waitForOuterWxml(
    '.communication-page',
    'communication-page--grid-2'
  )

  step('reconstructing the patient page with the same accessibility state')
  await navigate('reLaunch', '/pages/index/index')
  await waitForOuterWxml(
    '.communication-page',
    'communication-page--high-contrast'
  )
  await waitForOuterWxml(
    '.communication-page',
    'communication-page--font-extra-large'
  )
  await waitForOuterWxml(
    '.communication-page',
    'communication-page--grid-2'
  )

  step('replaying onboarding from caregiver settings and completing it again')
  await openCommunicationSettings()
  await tap('#replay-communication-onboarding-button')
  await waitForCurrentPage(PATIENT_PAGE_ROUTE)
  await waitForSelector('.communication-onboarding')
  const replayPreferences = await readJsonStorage(
    'cboard_communication_preferences'
  )
  assert.equal(replayPreferences.onboardingComplete, false)
  assert.equal(replayPreferences.highContrast, true)
  assert.equal(replayPreferences.fontSize, 'extra-large')
  assert.equal(replayPreferences.gridColumns, 2)
  await tap('#complete-communication-onboarding-button')
  await waitForSelector('.communication-page')
  await retry('the replayed onboarding completion to persist', async () => {
    const preferences = await readJsonStorage(
      'cboard_communication_preferences'
    )
    return preferences.onboardingComplete ? preferences : null
  })
}

async function verifyBoardManagementScenario() {
  step('installing the reduced default CBoard fixture')
  originalPictureLibraryFiles = await snapshotPictureLibraryFiles()
  await installPictureLibraryFixture(
    createReducedDefaultBoardFixtureBoards()
  )
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')

  step('opening board management through caregiver picture-library settings')
  await openPersonalImageLibraryFromCaregiverSettings()
  await tap('#open-board-manager-for-curation-button')
  await waitForCurrentPage(BOARD_MANAGEMENT_PAGE_ROUTE)
  await waitForSelector('#new-personal-board-name-input')

  step('creating and renaming a personal board through the real UI')
  await input('#new-personal-board-name-input', PERSONAL_BOARD_NAME)
  await tap('#create-personal-board-button')
  await waitForText('.board-management-notice', '已新增个人板块')
  const createdBoard = await retry(
    'the new personal board to persist',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      return boards.find(
        board =>
          board.id.startsWith(PERSONAL_BOARD_ID_PREFIX) &&
          board.name === PERSONAL_BOARD_NAME
      ) || null
    }
  )
  assert.equal(createdBoard.tiles.length, 0)

  await tap(`#rename-personal-board-${createdBoard.id}`)
  await input(
    `#rename-personal-board-input-${createdBoard.id}`,
    RENAMED_PERSONAL_BOARD_NAME
  )
  await tap(`#save-personal-board-name-${createdBoard.id}`)
  await waitForText('.board-management-notice', '个人板块名称已更新')
  await retry('the renamed personal board to persist', async () => {
    const boards = await readStoredPictureLibraryBoards()
    return boards.find(
      board =>
        board.id === createdBoard.id &&
        board.name === RENAMED_PERSONAL_BOARD_NAME
    ) || null
  })

  step('moving the personal board while retaining the CBoard home board')
  await tap(`#move-board-up-${createdBoard.id}`)
  await waitForText('.board-management-notice', '板块顺序已保存')
  const orderedBoards = await retry(
    'the personal board order to persist',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      return boards[0]?.id === HOME_BOARD_ID &&
        boards[1]?.id === createdBoard.id
        ? boards
        : null
    }
  )
  assert.equal(orderedBoards[2]?.id, QUICK_CHAT_BOARD_ID)

  step('adding a CBoard folder link from home to the personal board')
  await tap(`#board-link-toggle-${HOME_BOARD_ID}`)
  await waitForSelector(
    `#board-link-add-${HOME_BOARD_ID}-${createdBoard.id}`
  )
  await tap(`#board-link-add-${HOME_BOARD_ID}-${createdBoard.id}`)
  await waitForText('.board-management-notice', '已在“首页”中加入前往')
  const createdLink = await retry(
    'the personal board link to persist on the home board',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      const homeBoard = boards.find(board => board.id === HOME_BOARD_ID)
      return homeBoard?.tiles?.find(
        tile =>
          tile.id.startsWith(PERSONAL_BOARD_LINK_ID_PREFIX) &&
          tile.loadBoardId === createdBoard.id
      ) || null
    }
  )
  assert.equal(createdLink.label, RENAMED_PERSONAL_BOARD_NAME)

  step('opening the new personal board from the patient home board')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector(`#expression-tile-${createdLink.id}`)
  await tap(`#expression-tile-${createdLink.id}`)
  await waitForText(
    '.board-section-heading__title',
    RENAMED_PERSONAL_BOARD_NAME
  )

  step('removing the folder link and deleting the empty personal board')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await openPersonalImageLibraryFromCaregiverSettings()
  await tap('#open-board-manager-for-curation-button')
  await waitForCurrentPage(BOARD_MANAGEMENT_PAGE_ROUTE)
  await tap(`#board-link-toggle-${HOME_BOARD_ID}`)
  await waitForSelector(
    `#board-link-remove-${HOME_BOARD_ID}-${createdBoard.id}`
  )
  await tap(`#board-link-remove-${HOME_BOARD_ID}-${createdBoard.id}`)
  await waitForText('.board-management-notice', '已从“首页”移除前往')

  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await tap(`#delete-personal-board-${createdBoard.id}`)
  await waitForText('.board-management-notice', '已删除个人板块')
  const finalBoards = await retry(
    'the personal board and its navigation link to be removed',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      const personalBoardExists = boards.some(
        board => board.id === createdBoard.id
      )
      const linkExists = boards.some(board =>
        board.tiles.some(tile => tile.loadBoardId === createdBoard.id)
      )
      return !personalBoardExists && !linkExists ? boards : null
    }
  )
  assert.deepEqual(
    finalBoards.map(board => board.id),
    [HOME_BOARD_ID, QUICK_CHAT_BOARD_ID]
  )
  await restoreWxMocks()

  step('reconstructing the patient home board after cleanup')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForNoSelector(`#expression-tile-${createdLink.id}`)
}

async function verifyPersonalCardCopyScenario() {
  step('installing a deterministic device-private card in the second CBoard')
  originalPictureLibraryFiles = await snapshotPictureLibraryFiles()
  await installPictureLibraryFixture(
    createPersonalCardCopyFixtureBoards()
  )
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')

  step('opening the real caregiver picture-library maintenance page')
  await openPersonalImageLibraryFromCaregiverSettings()
  await waitForCurrentPage(PICTURE_LIBRARY_PAGE_ROUTE)
  await waitForSelector(
    `#custom-pictogram-copy-${PERSONAL_CARD_COPY_SOURCE_TILE_ID}`
  )
  await waitForOuterWxml(
    '#custom-pictogram-copy-target-board-picker',
    '复制目标板块：首页'
  )

  step('copying the personal card to the default target through the UI')
  await tap(
    `#custom-pictogram-copy-${PERSONAL_CARD_COPY_SOURCE_TILE_ID}`
  )
  await waitForText(
    '.custom-pictogram-editor__notice',
    `已把“${PERSONAL_CARD_COPY_LABEL}”复制到“首页”`
  )
  const copiedState = await retry(
    'the copied personal card to persist in the target board',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      const sourceBoard = boards.find(
        board => board.id === QUICK_CHAT_BOARD_ID
      )
      const targetBoard = boards.find(board => board.id === HOME_BOARD_ID)
      const sourceTile = sourceBoard?.tiles?.find(
        tile => tile.id === PERSONAL_CARD_COPY_SOURCE_TILE_ID
      )
      const copiedTile = targetBoard?.tiles?.find(
        tile =>
          tile.id !== PERSONAL_CARD_COPY_SOURCE_TILE_ID &&
          tile.pictogramAttribution?.provider === 'device-private' &&
          tile.pictogramAttribution?.originalId ===
            sourceTile?.pictogramAttribution?.originalId
      )
      return sourceTile && copiedTile
        ? { sourceTile, copiedTile }
        : null
    }
  )
  assert.notEqual(copiedState.sourceTile.id, copiedState.copiedTile.id)
  assert.equal(copiedState.sourceTile.image, copiedState.copiedTile.image)
  assert.equal(copiedState.sourceTile.sound, copiedState.copiedTile.sound)
  assert.equal(
    copiedState.sourceTile.pictogramAttribution.originalId,
    copiedState.copiedTile.pictogramAttribution.originalId
  )

  step('deleting the source card while preserving shared media')
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await tap(
    `#custom-pictogram-delete-${PERSONAL_CARD_COPY_SOURCE_TILE_ID}`
  )
  await waitForText(
    '.custom-pictogram-editor__notice',
    '共享照片或录音仍供其他板使用'
  )
  const deletedSourceState = await retry(
    'the source deletion and target retention to persist',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      const sourceBoard = boards.find(
        board => board.id === QUICK_CHAT_BOARD_ID
      )
      const targetBoard = boards.find(board => board.id === HOME_BOARD_ID)
      const sourceExists = sourceBoard?.tiles?.some(
        tile => tile.id === PERSONAL_CARD_COPY_SOURCE_TILE_ID
      )
      const copiedTile = targetBoard?.tiles?.find(
        tile => tile.id === copiedState.copiedTile.id
      )
      return !sourceExists && copiedTile ? copiedTile : null
    }
  )
  assert.equal(deletedSourceState.image, copiedState.sourceTile.image)
  await restoreWxMocks()

  step('reconstructing the picture library from persisted storage')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await openPersonalImageLibraryFromCaregiverSettings()
  await waitForSelector(
    `#custom-pictogram-copy-${copiedState.copiedTile.id}`
  )
  await waitForNoSelector(
    `#custom-pictogram-copy-${PERSONAL_CARD_COPY_SOURCE_TILE_ID}`
  )
}

async function verifyOfflineCommunicationScenario() {
  step('setting the official wx network boundary to offline')
  await mockWx(
    'getNetworkType',
    createCallbackWxMock(
      `{ networkType: 'none', errMsg: 'getNetworkType:ok' }`
    )
  )
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')

  assert.equal(
    (await queryElements('#offline-status-notice')).length,
    0,
    'technical network status must stay out of the patient-first surface'
  )
  await ensureCaregiverToolsVisible()
  await waitForText('#offline-status-notice', '当前为离线模式')

  step('confirming a patient expression while offline')
  await tap(`#expression-tile-${YES_TILE_ID}`)
  await waitForText('.candidate__sentence', YES_TILE_LABEL)
  await tap('#expression-confirm-button')
  await waitForText('#expression-status-notice', '表达已确认')

  step('confirming a caregiver reception while offline')
  await tap('#receiver-mode-button')
  await waitForSelector('#receiver-input')
  await waitForText('#offline-status-notice', '当前为离线模式')
  await tap('#receiver-example-0')
  await tap('#receiver-generate-button')
  await waitForSelector('.quality-banner--ready')
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    3,
    'the offline receiver path must still render 想喝水 as three pictograms'
  )
  await tap('#receiver-open-display-button')
  await waitForSelector('.receiver-display-page')
  assert.equal(
    (await queryElements('.receiver-display__card')).length,
    3,
    'the offline isolated display must preserve all three pictograms'
  )
  await tap('#receiver-feedback-understood')
  await waitForSelector('.workspace--receiver')

  step('reconstructing both offline directions from local history')
  await tap('#express-mode-button')
  await waitForSelector('.communication-page')
  await ensureCaregiverToolsVisible()
  await tap('#history-manager-button')
  await waitForSelector('.history-manager')
  assert.equal(
    (await queryElements('.history-manager__row')).length,
    2,
    'offline history must contain one expression and one reception'
  )
  await waitForSelector('.history-row__direction--express')
  await waitForSelector('.history-row__direction--receive')

  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await ensureCaregiverToolsVisible()
  await waitForText('#offline-status-notice', '当前为离线模式')
  await tap('#history-manager-button')
  await waitForSelector('.history-manager')
  assert.equal(
    (await queryElements('.history-manager__row')).length,
    2,
    'offline history must survive a patient-page reconstruction'
  )

  step('restoring the real wx network APIs')
  await restoreWxMocks()
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await ensureCaregiverToolsVisible()
  await waitForNoSelector('#offline-status-notice')
}

async function verifyExpressionStorageFailureScenario() {
  if ((await queryElements('.expression-chip')).length) {
    await tap('#expression-clear-button')
    await waitForNoSelector('.expression-chip')
  }

  step('preparing one patient expression before storage failure')
  await tap(`#expression-tile-${YES_TILE_ID}`)
  await waitForText('.candidate__sentence', YES_TILE_LABEL)
  const chipCountBeforeFailure = (
    await queryElements('.expression-chip')
  ).length
  const candidateCountBeforeFailure = (
    await queryElements('.candidate-row')
  ).length
  const selectedCandidateBeforeFailure = await readOuterWxml(
    '#expression-candidate-0'
  )
  assert.equal(chipCountBeforeFailure, 1)
  assert.ok(candidateCountBeforeFailure > 0)
  assert.ok(
    selectedCandidateBeforeFailure.includes('candidate--selected'),
    'the first candidate must be selected before confirmation'
  )

  step('forcing WeChat storage failure only during confirmation')
  await mockWx(
    'setStorageSync',
    `function() { throw new Error('simulated storage quota exceeded'); }`
  )
  await tap('#expression-confirm-button')
  await waitForText(
    '#expression-status-notice',
    '表达已生成，但本地保存失败，请稍后再试。'
  )
  assert.deepEqual(
    await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY),
    [],
    'failed confirmation must not create a communication history record'
  )
  assert.equal(
    (await queryElements('.expression-chip')).length,
    chipCountBeforeFailure,
    'failed confirmation must preserve the current pictogram sequence'
  )
  assert.equal(
    (await queryElements('.candidate-row')).length,
    candidateCountBeforeFailure,
    'failed confirmation must preserve every candidate sentence'
  )
  assert.ok(
    (await readOuterWxml('#expression-candidate-0')).includes(
      'candidate--selected'
    ),
    'failed confirmation must preserve the selected candidate'
  )
  assert.ok(
    (await readOuterWxml('.expression-strip')).includes(YES_DEFAULT_IMAGE),
    'failed confirmation must keep the selected CBoard image visible'
  )
  assert.equal(
    (await readOuterWxml('#expression-confirm-button')).includes(
      'disabled="true"'
    ),
    false,
    'failed confirmation must keep the retry action enabled'
  )

  step('restoring WeChat storage and retrying in place')
  await restoreWxMocks()
  await tap('#expression-confirm-button')
  await waitForText(
    '#expression-status-notice',
    '表达已确认，并保存到微信本地存储。'
  )
  const confirmedHistory = await retry(
    'one confirmed expression after storage retry',
    async () => {
      const history = await readJsonStorage(
        COMMUNICATION_HISTORY_STORAGE_KEY
      )
      return history.length === 1 &&
        history[0].direction === 'express' &&
        history[0].recordStatus === 'confirmed'
        ? history
        : null
    }
  )
  assert.deepEqual(confirmedHistory[0].labels, [YES_TILE_LABEL])

  await tap('#expression-confirm-button')
  await waitForText(
    '#expression-status-notice',
    '这次表达已经确认。'
  )
  assert.equal(
    (await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY)).length,
    1,
    'repeated confirmation after retry must not duplicate history'
  )
}

async function verifyHistoryReceiverReviewScenario() {
  const targetRecordId = 'history-review-e2e-older'
  const newerRecordId = 'history-review-e2e-newer'
  const sessionId = 'history-review-e2e-session'
  const createRecord = ({
    id,
    label,
    tileId,
    image,
    createdAt
  }) => ({
    contractVersion: 1,
    id,
    sessionId,
    patientId: 'local-patient',
    workspaceId: 'local-workspace',
    direction: 'receive',
    inputText: label,
    labels: [label],
    output: [
      {
        id: tileId,
        boardId: HOME_BOARD_ID,
        label,
        vocalization: label,
        image,
        backgroundColor: 'rgb(255, 241, 118)',
        loadBoard: ''
      }
    ],
    pictogramSequence: [
      {
        pictogramId: tileId,
        label,
        source: 'local_dict',
        boardId: HOME_BOARD_ID,
        matchType: 'exact',
        confidence: 1,
        originalToken: label
      }
    ],
    recordStatus: 'confirmed',
    isFavorite: false,
    createdAt,
    updatedAt: createdAt,
    confirmedAt: createdAt
  })
  const originalHistory = [
    createRecord({
      id: newerRecordId,
      label: YES_TILE_LABEL,
      tileId: YES_TILE_ID,
      image: YES_DEFAULT_IMAGE,
      createdAt: 1_700_000_001_000
    }),
    createRecord({
      id: targetRecordId,
      label: NO_TILE_LABEL,
      tileId: NO_TILE_ID,
      image: NO_DEFAULT_IMAGE,
      createdAt: 1_700_000_000_000
    })
  ]

  step('seeding two confirmed receiver records for arbitrary history review')
  await callWx('setStorageSync', [
    COMMUNICATION_HISTORY_STORAGE_KEY,
    JSON.stringify(originalHistory)
  ])
  await navigate(
    'reLaunch',
    '/packages/management/pages/index/index?view=history'
  )
  await waitForSelector('.history-manager')
  assert.equal(
    (await queryElements('.history-manager__row')).length,
    2,
    'history review fixture must expose both confirmed receiver records'
  )
  await waitForSelector(`#history-receiver-review-${targetRecordId}`)
  const historyBeforeReview = await readJsonStorage(
    COMMUNICATION_HISTORY_STORAGE_KEY
  )
  assert.deepEqual(
    historyBeforeReview.find(entry => entry.id === targetRecordId)?.labels,
    [NO_TILE_LABEL],
    'the normalized source history must retain the older receiver record'
  )

  step('replacing a pictogram in the older confirmed receiver record')
  await tap(`#history-receiver-review-${targetRecordId}`)
  await waitForSelector('.history-receiver-review')
  await waitForText(
    '.history-receiver-review__token',
    NO_TILE_LABEL
  )
  const receiverReviewWxml = await readOuterWxml(
    '.history-receiver-review'
  )
  const replaceButtonId = findElementIdByContent(
    receiverReviewWxml,
    'button',
    ['换图']
  )
  assert.ok(
    replaceButtonId,
    'the runtime review panel must expose the visible replace action'
  )
  await tap(`#${replaceButtonId}`)
  await waitForSelector('.history-receiver-picker')
  const receiverPickerWxml = await readOuterWxml(
    '.history-receiver-picker'
  )
  const yesCandidateButtonId = findElementIdByContent(
    receiverPickerWxml,
    'button',
    [YES_DEFAULT_IMAGE, `>${YES_TILE_LABEL}<`]
  )
  assert.ok(
    yesCandidateButtonId,
    'the runtime picture picker must expose the CBoard yes pictogram'
  )
  await tap(`#${yesCandidateButtonId}`)
  await waitForText(
    '.storage-notice',
    '历史图片修正已保存，原记录和修正证据均已保留。'
  )

  const correction = await retry(
    'append-only caregiver history correction persistence',
    async () => {
      const corrections = await readJsonStorage(
        RECEIVER_CORRECTION_STORAGE_KEY
      )
      return corrections.find(
        entry =>
          entry.expressionId === targetRecordId &&
          entry.context === 'caregiver_history_review' &&
          entry.action === 'replace_pictogram' &&
          entry.pictogramIdBefore === NO_TILE_ID &&
          entry.pictogramIdAfter === YES_TILE_ID
      ) || null
    }
  )
  assert.deepEqual(correction.revisionBefore.labels, [NO_TILE_LABEL])
  assert.deepEqual(correction.revisionAfter.labels, [YES_TILE_LABEL])
  assert.equal(
    correction.revisionBefore.pictogramSequence[0].pictogramId,
    NO_TILE_ID
  )
  assert.equal(
    correction.revisionAfter.pictogramSequence[0].pictogramId,
    YES_TILE_ID
  )
  assert.deepEqual(
    await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY),
    historyBeforeReview,
    'history review must not overwrite either confirmed source record'
  )
  await waitForOuterWxml(
    '.history-receiver-review',
    YES_DEFAULT_IMAGE
  )
  await waitForText(
    '.history-row__revision',
    '已有照护者图片修正'
  )
  assert.equal(
    (await queryElements('.history-row__revision')).length,
    1,
    'only the reviewed receiver record may expose a history revision'
  )

  step('reconstructing the history projection from WeChat storage')
  await navigate(
    'reLaunch',
    '/packages/management/pages/index/index?view=history'
  )
  await waitForSelector('.history-manager')
  await waitForText(
    '.history-row__revision',
    '已有照护者图片修正'
  )
  assert.equal(
    (await queryElements('.history-row__revision')).length,
    1,
    'the reconstructed projection must stay scoped to the reviewed record'
  )
  await tap(`#history-receiver-review-${targetRecordId}`)
  await waitForOuterWxml(
    '.history-receiver-review',
    YES_DEFAULT_IMAGE
  )
  assert.deepEqual(
    await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY),
    historyBeforeReview,
    'page reconstruction must preserve the immutable source history'
  )
  const reconstructedCorrections = await readJsonStorage(
    RECEIVER_CORRECTION_STORAGE_KEY
  )
  assert.equal(
    reconstructedCorrections.filter(
      entry => entry.expressionId === targetRecordId
    ).length,
    1,
    'page reconstruction must not duplicate correction evidence'
  )
}

async function verifyConversationSessionScenario() {
  step('creating one confirmed turn in the initial conversation')
  await tap(`#expression-tile-${YES_TILE_ID}`)
  await waitForText('.candidate__sentence', YES_TILE_LABEL)
  await tap('#expression-confirm-button')
  await waitForText('#expression-status-notice', '表达已确认')

  const initialSession = await readJsonStorage(
    'cboard_communication_active_session'
  )
  const initialHistory = await readJsonStorage(
    COMMUNICATION_HISTORY_STORAGE_KEY
  )
  assert.equal(initialHistory.length, 1)
  assert.equal(
    initialHistory[0].sessionId,
    initialSession.id,
    'the confirmed turn must belong to the active conversation'
  )

  step('selecting and reconstructing the fixed hospital scene')
  await tap('#receiver-mode-button')
  await waitForSelector('#receiver-input')
  await tap('#conversation-scene-hospital')
  await waitForText('.receiver-context__status', '医院')
  await retry('the hospital scene to persist', async () => {
    const session = await readJsonStorage(
      'cboard_communication_active_session'
    )
    return session.id === initialSession.id && session.scene === 'hospital'
      ? session
      : null
  })
  assert.ok(
    (await readOuterWxml('#conversation-scene-hospital')).includes(
      'receiver-context__scene--active'
    ),
    'the selected hospital scene must be visibly active'
  )

  await navigate('reLaunch', '/packages/caregiver/pages/receiver/index')
  await waitForSelector('#receiver-input')
  await waitForText('.receiver-context__status', '医院')
  assert.ok(
    (await readOuterWxml('#conversation-scene-hospital')).includes(
      'receiver-context__scene--active'
    ),
    'the hospital scene must remain active after page reconstruction'
  )

  step('toggling the same scene off and on without changing sessions')
  await tap('#conversation-scene-hospital')
  await waitForText('.receiver-context__status', '未选择')
  let toggledSession = await readJsonStorage(
    'cboard_communication_active_session'
  )
  assert.equal(toggledSession.id, initialSession.id)
  assert.equal(toggledSession.scene, undefined)

  await tap('#conversation-scene-hospital')
  await waitForText('.receiver-context__status', '医院')
  toggledSession = await readJsonStorage(
    'cboard_communication_active_session'
  )
  assert.equal(toggledSession.id, initialSession.id)
  assert.equal(toggledSession.scene, 'hospital')

  step('cancelling the new-conversation confirmation safely')
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: false, cancel: true, errMsg: 'showModal:ok' }`
    )
  )
  await tap('#receiver-new-conversation')
  await sleep(800)
  const cancelledSession = await readJsonStorage(
    'cboard_communication_active_session'
  )
  assert.equal(cancelledSession.id, initialSession.id)
  assert.equal(cancelledSession.scene, 'hospital')
  assert.deepEqual(
    await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY),
    initialHistory,
    'cancelling a new conversation must not change history'
  )
  await restoreWxMocks()

  step('confirming a new conversation clears context but keeps history')
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await tap('#receiver-new-conversation')
  await waitForText(
    '.receiver-context__notice',
    '原有历史仍会保留'
  )
  const nextSession = await retry(
    'a new active conversation without a scene',
    async () => {
      const session = await readJsonStorage(
        'cboard_communication_active_session'
      )
      return session.id !== initialSession.id && !session.scene
        ? session
        : null
    }
  )
  assert.equal(
    await readProperty('#receiver-input', 'value'),
    '',
    'a new conversation must start with an empty receiver workspace'
  )
  assert.deepEqual(
    await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY),
    initialHistory,
    'starting a new conversation must preserve prior history verbatim'
  )
  await restoreWxMocks()

  step('reconstructing the new empty conversation')
  await navigate('reLaunch', '/packages/caregiver/pages/receiver/index')
  await waitForSelector('#receiver-input')
  await waitForText('.receiver-context__status', '未选择')
  const reconstructedSession = await readJsonStorage(
    'cboard_communication_active_session'
  )
  assert.equal(reconstructedSession.id, nextSession.id)
  assert.equal(reconstructedSession.scene, undefined)
  assert.equal(await readProperty('#receiver-input', 'value'), '')

  await tap('#express-mode-button')
  await waitForSelector('.communication-page')
  assert.equal(
    (await queryElements('.expression-chip')).length,
    0,
    'the patient workspace must be empty in the new conversation'
  )
  assert.equal(
    (await readJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY)).length,
    1,
    'the old confirmed turn must remain available for review'
  )
}

async function generateReceiverText(text) {
  const receiverRecordsBefore = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  const activeDraftBefore = receiverRecordsBefore.find(
    record => record.recordStatus === 'draft'
  )
  await input('#receiver-input', text)
  await tap('#receiver-generate-button')
  await retry(`a new receiver draft for ${text}`, async () => {
    const receiverRecordsAfter = JSON.parse(
      String(
        await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
      )
    )
    return receiverRecordsAfter.find(
      record =>
        record.recordStatus === 'draft' &&
        record.inputText === text &&
        (!activeDraftBefore || record.id !== activeDraftBefore.id)
    ) || null
  })
  await waitForText('.review-row__token', text)
}

async function generateReceiverTextWithManualSegmentation(text) {
  await input('#receiver-input', text)
  await tap('#receiver-generate-button')
  await waitForSelector('#receiver-segmentation-input')
  await input('#receiver-segmentation-input', text)
  await tap('#receiver-apply-segmentation-button')
  await waitForText('.review-row__token', text)
}

async function replaceOnlyReviewItem(replacementTileId) {
  await tap('.review-action--swap')
  await waitForSelector('.replacement-panel')
  await tap(`#replacement-option-${replacementTileId}`)
}

let originalStorage = null
let projectOpened = false
let scenarioPassed = false
let createdPersonalImagePath = ''
let createdMissingTokenImagePath = ''
let createdOnlinePictogramPath = ''
let originalPictureLibraryFiles = null
let createdAacImportFixturePath = ''
let createdAacImportAssetRoot = ''
let aacImportAttempted = false
let originalCommunicationLogFiles = null
let originalPictureLibraryBackupFiles = null
let originalLocalDeviceDataBackupFiles = null
let createdPictureLibraryBackupAssetRoot = ''
let createdLocalDeviceDataAssetRoot = ''

async function prepareAacImportFixture(fileName, createFixture) {
  originalPictureLibraryFiles = await snapshotPictureLibraryFiles()
  createdAacImportFixturePath = await createFixture()
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await mockWx(
    'chooseMessageFile',
    createCallbackWxMock(
      JSON.stringify({
        tempFiles: [
          {
            name: fileName,
            path: createdAacImportFixturePath
          }
        ],
        errMsg: 'chooseMessageFile:ok'
      })
    )
  )
  aacImportAttempted = true
}

async function cleanupAacImportFixture() {
  await restoreWxMocks()
  await removePictureLibraryAssetRoot(createdAacImportAssetRoot)
  createdAacImportAssetRoot = ''
  await restorePictureLibraryFiles(
    originalPictureLibraryFiles,
    createdAacImportFixturePath
  )
  originalPictureLibraryFiles = null
  createdAacImportFixturePath = ''
  aacImportAttempted = false
}

async function verifyImageTextRecognitionScenario() {
  assert.ok(
    accountFakeApiControlUrl,
    'OCR E2E requires the local fake API control URL'
  )

  step('opening the caregiver image-text recognition flow')
  await callWx('setStorageSync', [
    CBOARD_AUTH_TOKEN_STORAGE_KEY,
    'e2e-ocr-token'
  ])
  await navigate(
    'reLaunch',
    '/packages/caregiver/pages/receiver/index'
  )
  await waitForSelector('.workspace--receiver')
  await tap('#receiver-image-text-button')
  await waitForCurrentPage(OCR_PAGE_ROUTE)
  await waitForSelector('.ocr-page')
  await waitForText(
    '.ocr-hero__description',
    '不会自动分词、配图、保存历史或发送'
  )
  await waitForText(
    '.ocr-card--privacy',
    '不把原图写入文件、数据库或日志'
  )

  const temporaryImagePath = await createWechatTempPersonalImage()
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await mockWx(
    'chooseMedia',
    createCallbackWxMock(
      `{ tempFiles: [{ tempFilePath: '${temporaryImagePath}' }], errMsg: 'chooseMedia:ok' }`
    )
  )

  step('uploading a real WeChat temporary image to the local OCR boundary')
  await tap('#ocr-select-button')
  await waitForSelector('.workspace--receiver')
  await waitForProperty(
    '#receiver-input',
    'value',
    OCR_RECOGNIZED_TEXT
  )
  await waitForText(
    '.storage-notice',
    '识别文字已填入，可人工修改后再生成图片序列。'
  )
  assert.equal(
    (await queryElements('.review-row')).length,
    0,
    'OCR text must not be segmented or matched automatically'
  )
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    0,
    'OCR text must not create an image preview automatically'
  )
  assert.deepEqual(
    JSON.parse(
      String(
        await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
      )
    ),
    [],
    'OCR text must not create a receiver record before explicit generation'
  )
  assert.equal(
    String(
      await callWx('getStorageSync', [
        IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY
      ]) || ''
    ),
    '',
    'the one-time OCR intent must be consumed after returning'
  )

  const requests = await readAccountRequestLog()
  const ocrRequest = requests.find(
    request =>
      request.url === '/gpt/communication/ocr' &&
      request.method === 'POST'
  )
  assert.ok(ocrRequest, 'the OCR endpoint must receive one upload')
  assert.equal(
    ocrRequest.authorized,
    true,
    'the OCR upload must carry the existing CBoard bearer token'
  )
  assert.match(
    String(ocrRequest.contentType || ''),
    /^multipart\/form-data;/,
    'the OCR upload must use multipart form data'
  )
  assert.ok(
    Number(ocrRequest.bodyBytes) > 0,
    'the OCR upload must contain actual image bytes'
  )

  step('correcting OCR text before explicitly generating pictograms')
  await input('#receiver-input', OCR_CORRECTED_TEXT)
  await waitForProperty(
    '#receiver-input',
    'value',
    OCR_CORRECTED_TEXT
  )
  assert.equal(
    (await queryElements('.review-row')).length,
    0,
    'editing OCR text must remain side-effect free until generation'
  )
  await tap('#receiver-generate-button')
  await retry('the manually confirmed OCR pictogram sequence', async () =>
    (await queryElements('.review-row')).length > 0 ? true : null
  )
  const receiverRecords = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  assert.ok(
    receiverRecords.some(
      record =>
        record.recordStatus === 'draft' &&
        record.inputText === OCR_CORRECTED_TEXT
    ),
    'only the corrected text may create the explicit receiver draft'
  )
  await restoreWxMocks()
}

try {
  assert.ok(
    wechatidePath && existsSync(wechatidePath),
    `wechatide Skill CLI was not found: ${wechatidePath || '(empty)'}`
  )

  if (backgroundOnly) {
    step(
      'checking for an existing project runtime without opening a window'
    )
    try {
      await invokeTool('automation_runtime_info', {
        project: projectPath,
        action: 'currentPage'
      })
    } catch (error) {
      step(
        'runtime probe failed; retrying through a background simulator page open'
      )
      try {
        await invokeTool(
          'simulator_open_page',
          {
            project: projectPath,
            page: 'pages/index/index'
          },
          60_000
        )
        await sleep(8_000)
        await retry(
          'the background automation runtime',
          () => invokeTool('automation_runtime_info', {
            project: projectPath,
            action: 'currentPage'
          }),
          90_000
        )
      } catch (reconnectError) {
        throw new Error(
          'Background-only E2E requires this project to already be open; ' +
          'the script will not open or focus it automatically. ' +
          `${error.message}; reconnect failed: ${reconnectError.message}`
        )
      }
    }
    projectOpened = true
  } else {
    step('opening the project through the official WeChat IDE Skill')
    await invokeTool(
      'open_project_window',
      { project: projectPath },
      60_000
    )
    projectOpened = true

    step(
      'clearing compile-only caches so the simulator uses the latest dist'
    )
    await invokeTool('debug_clear_cache', {
      project: projectPath,
      action: 'cleanCompileCache'
    })
    await invokeTool('debug_clear_cache', {
      project: projectPath,
      action: 'cleanProjectFileListCache'
    })

    step('reopening the project after the compile-cache reset')
    await invokeTool(
      'close_project_window',
      { project: projectPath },
      60_000
    )
    projectOpened = false
    await invokeTool(
      'open_project_window',
      { project: projectPath },
      60_000
    )
    projectOpened = true
  }

  step('clearing the WeChat compile cache without touching local storage')
  await invokeTool(
    'debug_clear_cache',
    { project: projectPath, action: 'cleanCompileCache' },
    60_000
  )
  step('refreshing the simulator to load the latest Taro build')
  await invokeTool(
    'simulator_refresh',
    { project: projectPath },
    60_000
  )
  await sleep(3_000)
  step('opening the compiled main page and waiting for the WebView')
  await invokeTool(
    'simulator_open_page',
    {
      project: projectPath,
      page: 'pages/index/index'
    },
    60_000
  )
  await sleep(8_000)
  await retry('the patient page WebView', async () => {
    if ((await queryElements('.communication-page')).length) {
      return true
    }
    return (await queryElements('.communication-onboarding')).length
      ? true
      : null
  }, 90_000)

  if (restoreStorageRecoveryOnly) {
    step(`restoring the verified storage recovery: ${storageRecoveryFile}`)
    const recovery = readStorageRecovery()
    await restoreStorage(recovery.entries)
    removeStorageRecovery()
    step(`restored ${recovery.entries.length} storage entries`)
    scenarioPassed = true
  } else {
  assert.equal(
    existsSync(storageRecoveryFile),
    false,
    `pending storage recovery must be handled before E2E: ${storageRecoveryFile}`
  )
  step('snapshotting all existing WeChat local storage')
  originalStorage = await retry(
    'the WeChat storage runtime',
    snapshotStorage,
    90_000
  )
  step(`snapshotted ${originalStorage.length} storage entries`)
  persistStorageRecovery(originalStorage)
  step(`persisted storage recovery: ${storageRecoveryFile}`)
  originalCommunicationLogFiles = await listCommunicationLogFiles()
  originalPictureLibraryBackupFiles = await listPictureLibraryBackupFiles()
  originalLocalDeviceDataBackupFiles =
    await listLocalDeviceDataBackupFiles()

  step('isolating deterministic E2E storage without clearing user data')
  await isolateStorage()
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')

  if (runAccessibilityOnly) {
    await verifyOnboardingAccessibilityScenario()
  } else if (runBoardManagementOnly) {
    await verifyBoardManagementScenario()
  } else if (runPersonalCardCopyOnly) {
    await verifyPersonalCardCopyScenario()
  } else if (runAdultCareDefaultsOnly) {
    await verifyAdultCareDefaultBoardsScenario()
  } else if (runFeedbackOnly) {
    await verifyCandidateFeedbackScenario()
  } else if (runBoardVisibilityOnly) {
    await verifyBoardVisibilityScenario()
  } else if (runLibraryPlacementOnly) {
    await verifyCaregiverPictureLibraryPlacementScenario()
  } else if (runOfflineOnly) {
    await verifyOfflineCommunicationScenario()
  } else if (runStorageFailureOnly) {
    await verifyExpressionStorageFailureScenario()
  } else if (runHistoryReviewOnly) {
    await verifyHistoryReceiverReviewScenario()
  } else if (runSessionOnly) {
    await verifyConversationSessionScenario()
  } else if (runOrderingOnly) {
    await verifyPictogramOrderingScenario()
  } else if (runOcrOnly) {
    await verifyImageTextRecognitionScenario()
  } else if (!runAccountSyncOnly) {
  if ((await queryElements('.expression-chip')).length) {
    await tap('#expression-clear-button')
    await waitForNoSelector('.expression-chip')
  }

  step('confirming a patient-side expression')
  await tap(`#expression-tile-${YES_TILE_ID}`)
  await waitForText('.candidate__sentence', YES_TILE_LABEL)
  await tap('#expression-confirm-button')
  await waitForText('#expression-status-notice', '表达已确认')

  step('opening the independent caregiver receiver page')
  await tap('#receiver-mode-button')
  await waitForSelector('#receiver-input')
  await tap('#receiver-example-0')
  await tap('#receiver-generate-button')
  await waitForSelector('.quality-banner--ready')
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    3,
    '想喝水 should produce three preview pictograms'
  )
  let receiverRecords = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  const initialReceiverDrafts = receiverRecords.filter(
    record =>
      record.recordStatus === 'draft' &&
      record.inputText === '想喝水'
  )
  assert.equal(
    initialReceiverDrafts.length,
    1,
    'the generated receiver sequence must create one active draft'
  )
  const initialReceiverDraftId = initialReceiverDrafts[0].id

  step('restoring the active receiver draft after page reconstruction')
  await navigate('reLaunch', '/packages/caregiver/pages/receiver/index')
  await waitForSelector('.workspace--receiver')
  const reconstructedReceiverRecords = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  const reconstructedReceiverDraft = reconstructedReceiverRecords.find(
    record => record.id === initialReceiverDraftId
  )
  const reconstructedPatientId = String(
    await callWx('getStorageSync', ['cboard_communication_patient_id'])
  )
  const reconstructedWorkspaceId = String(
    await callWx('getStorageSync', ['cboard_communication_workspace_id'])
  )
  const reconstructedSession = JSON.parse(
    String(
      await callWx('getStorageSync', [
        'cboard_communication_active_session'
      ])
    )
  )
  assert.ok(
    reconstructedReceiverDraft,
    'page reconstruction must preserve the active draft record'
  )
  assert.equal(
    reconstructedReceiverDraft.patientId,
    reconstructedPatientId,
    'the active draft must remain in the current patient scope'
  )
  assert.equal(
    reconstructedReceiverDraft.workspaceId,
    reconstructedWorkspaceId,
    'the active draft must remain in the current workspace scope'
  )
  assert.equal(
    reconstructedReceiverDraft.sessionId,
    reconstructedSession.id,
    'the active draft must remain in the current conversation session'
  )
  const reconstructedInputValue =
    await readProperty('#receiver-input', 'value')
  if (reconstructedInputValue !== '想喝水') {
    const reconstructedNotice = await readText('.storage-notice')
    throw new Error(
      'receiver draft storage survived but workspace restore failed: ' +
        JSON.stringify({
          inputValue: reconstructedInputValue,
          notice: reconstructedNotice,
          draftId: reconstructedReceiverDraft.id,
          sessionId: reconstructedSession.id,
          direction: reconstructedReceiverDraft.direction,
          recordStatus: reconstructedReceiverDraft.recordStatus,
          inputText: reconstructedReceiverDraft.inputText,
          pictogramSequenceCount:
            reconstructedReceiverDraft.pictogramSequence?.length || 0,
          outputCount: reconstructedReceiverDraft.output?.length || 0
        })
    )
  }
  await waitForText(
    '.storage-notice',
    '已恢复上次未完成的图片复核。'
  )
  assert.equal(
    (await queryElements('.review-row')).length,
    3,
    'the restored draft must preserve the review sequence'
  )
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    3,
    'the restored draft must preserve the image preview'
  )
  receiverRecords = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  const restoredReceiverDrafts = receiverRecords.filter(
    record =>
      record.recordStatus === 'draft' &&
      record.inputText === '想喝水'
  )
  assert.equal(
    restoredReceiverDrafts.length,
    1,
    'page reconstruction must not duplicate the active draft'
  )
  assert.equal(
    restoredReceiverDrafts[0].id,
    initialReceiverDraftId,
    'page reconstruction must reuse the same active draft'
  )
  await waitForProperty(
    '#receiver-correction-learning-switch',
    'checked',
    true
  )

  step('saving and opening the isolated receiver display')
  await tap('#receiver-open-display-button')
  await waitForSelector('.receiver-display-page')
  assert.equal(
    (await queryElements('.receiver-display__card')).length,
    3,
    'the isolated display should contain three pictograms'
  )
  assert.equal(
    (await queryElements('.communication-page')).length,
    0,
    'the receiver display must not be layered over the workspace'
  )
  await tap('#receiver-feedback-repeat')
  await waitForText(
    '.receiver-display__feedback-notice',
    '已记录：请再说一次。'
  )
  let feedbackRecords = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  let feedbackRecord = feedbackRecords.find(
    record =>
      record.recordStatus === 'confirmed' &&
      record.inputText === '想喝水'
  )
  assert.equal(
    feedbackRecord?.patientFeedback,
    'repeat_requested',
    'repeat feedback must persist on the confirmed receiver record'
  )
  assert.deepEqual(
    feedbackRecord?.patientFeedbackEvents.map(event => event.type),
    ['repeat_requested'],
    'repeat feedback must start the bounded event trail'
  )
  assert.equal(
    (await queryElements('.receiver-display-page')).length,
    1,
    'repeat feedback must keep the patient in the isolated display'
  )
  await tap('#receiver-feedback-not-understood')
  await waitForSelector('.workspace--receiver')
  await waitForProperty('#receiver-input', 'value', '想喝水')
  await waitForText(
    '.storage-notice',
    '患者反馈：没明白，请修改文字、分词或图片后重新展示。'
  )
  assert.equal(
    (await queryElements('.review-row')).length,
    3,
    'not-understood feedback must restore the original review sequence'
  )
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    3,
    'not-understood feedback must restore the original image preview'
  )

  step('restoring the not-understood review after page reconstruction')
  await navigate('reLaunch', '/packages/caregiver/pages/receiver/index')
  await waitForSelector('.workspace--receiver')
  await waitForProperty('#receiver-input', 'value', '想喝水')
  await waitForText(
    '.storage-notice',
    '患者反馈：没明白，请修改文字、分词或图片后重新展示。'
  )
  assert.equal(
    (await queryElements('.review-row')).length,
    3,
    'the not-understood record must restore its review sequence after relaunch'
  )
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    3,
    'the not-understood record must restore its preview after relaunch'
  )
  await tap('#receiver-open-display-button')
  await waitForSelector('.receiver-display-page')
  await tap('#receiver-feedback-understood')
  await waitForSelector('.workspace--receiver')
  await waitForText(
    '.storage-notice',
    '患者反馈：已理解，可以开始下一句话。'
  )
  feedbackRecords = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY])
    )
  )
  feedbackRecord = feedbackRecords.find(
    record =>
      record.recordStatus === 'confirmed' &&
      record.inputText === '想喝水'
  )
  assert.equal(
    feedbackRecord?.patientFeedback,
    'understood',
    'understood feedback must become the latest receiver state'
  )
  const confirmedReceiverRecords = feedbackRecords.filter(
    record =>
      record.recordStatus === 'confirmed' &&
      record.inputText === '想喝水'
  )
  assert.equal(
    confirmedReceiverRecords.length,
    1,
    'reopening an unchanged restored record must not create duplicate history'
  )
  assert.equal(
    confirmedReceiverRecords[0].id,
    initialReceiverDraftId,
    'the confirmed record must retain the original draft identity'
  )
  assert.deepEqual(
    feedbackRecord?.patientFeedbackEvents.map(event => event.type),
    ['repeat_requested', 'not_understood', 'understood'],
    'the confirmed record must preserve the patient feedback trail'
  )

  step('verifying learned replacement reuse')
  await generateReceiverText('水')
  await replaceOnlyReviewItem(YES_TILE_ID)
  await waitForText('.review-row__label', YES_TILE_LABEL)
  await generateReceiverText('水')
  await waitForText('.review-row__label', YES_TILE_LABEL)
  await waitForText('.review-row__match', '人工确认')

  step('verifying learned deletion tombstones')
  await generateReceiverText('喝')
  const deletedPictogramId = await readReviewPictogramId()
  assert.ok(deletedPictogramId, 'the deleted pictogram must have an ID')
  await tap('.review-action--delete')
  await waitForNoSelector('.review-row')
  const deletionCorrections = JSON.parse(
    String(
      await callWx('getStorageSync', [
        'cboard_communication_receiver_corrections'
      ])
    )
  )
  const deletionCorrection = deletionCorrections.find(
    correction =>
      correction.action === 'delete_pictogram' &&
      correction.originalToken === '喝' &&
      correction.isUsedForLearning === true
  )
  const workspaceId = String(
    await callWx('getStorageSync', [
      'cboard_communication_workspace_id'
    ])
  )
  assert.ok(
    deletionCorrection,
    'the learned deletion correction must be persisted'
  )
  assert.ok(workspaceId, 'the active workspace must have an ID')
  assert.equal(
    deletionCorrection.workspaceId,
    workspaceId,
    'the tombstone must belong to the active workspace'
  )
  assert.equal(
    typeof deletionCorrection.createdAt,
    'number',
    'the tombstone timestamp must remain numeric after persistence'
  )
  assert.ok(
    Math.abs(Date.now() - deletionCorrection.createdAt) <
      90 * 24 * 60 * 60 * 1000,
    'the tombstone timestamp must remain inside the retention window'
  )
  assert.equal(
    deletionCorrection.pictogramIdBefore,
    deletedPictogramId,
    'the tombstone must use the deleted pictogram ID'
  )
  await tap('#express-mode-button')
  await waitForSelector('.communication-page')
  await tap('#receiver-mode-button')
  await waitForSelector('#receiver-input')
  await generateReceiverText('喝')
  assert.equal(
    await readCorrectionMemoryProbeId(),
    'receiver-correction-memory-2-1',
    'the reopened receiver must load both correction rules and one tombstone'
  )
  const rematchedPictogramId = await readReviewPictogramId()
  assert.equal(
    rematchedPictogramId,
    '',
    `tombstone ${deletedPictogramId} should suppress the rematched pictogram ${rematchedPictogramId}`
  )
  await waitForText('.review-row__label', '尚未匹配图片')
  await waitForText('.review-row__match', '未匹配')

  step('verifying that disabled learning does not change later matching')
  await trigger(
    '#receiver-correction-learning-switch',
    'change',
    { value: false }
  )
  await waitForProperty(
    '#receiver-correction-learning-switch',
    'checked',
    false
  )
  await generateReceiverText('吃')
  const originalEatLabel = await readText('.review-row__label')
  assert.notEqual(originalEatLabel, YES_TILE_LABEL)
  await replaceOnlyReviewItem(YES_TILE_ID)
  await waitForText('.review-row__label', YES_TILE_LABEL)
  await generateReceiverText('吃')
  assert.equal(
    await readText('.review-row__label'),
    originalEatLabel,
    'learning-disabled replacement must not affect the next match'
  )

  step('verifying manual pictogram insertion order and audit evidence')
  await generateReceiverText('想')
  const originalInsertPictogramId = await readReviewPictogramId()
  assert.ok(
    originalInsertPictogramId,
    'the insertion anchor must have a stable CBoard tile ID'
  )
  await tap('.review-action--insert')
  await waitForText(
    '.replacement-panel__title',
    '选择要添加的图片'
  )
  await tap(`#replacement-option-${YES_TILE_ID}`)
  await waitForText('.storage-notice', '已在后方添加「是」')
  assert.equal(
    (await queryElements('.review-row')).length,
    2,
    'manual insertion should add one review item'
  )
  assert.equal(
    (await queryElements('.receiver-preview__item')).length,
    2,
    'manual insertion should add one output preview item'
  )
  const insertionCorrections = JSON.parse(
    String(
      await callWx('getStorageSync', [
        'cboard_communication_receiver_corrections'
      ])
    )
  )
  const insertionCorrection = insertionCorrections
    .slice()
    .reverse()
    .find(correction => correction.action === 'insert_pictogram')
  assert.ok(
    insertionCorrection,
    'manual insertion must persist an insert_pictogram audit row'
  )
  assert.equal(insertionCorrection.originalToken, '')
  assert.equal(insertionCorrection.normalizedToken, YES_TILE_LABEL)
  assert.equal(insertionCorrection.sequenceIndexBefore, null)
  assert.equal(insertionCorrection.sequenceIndexAfter, 1)
  assert.equal(insertionCorrection.pictogramIdBefore, null)
  assert.equal(insertionCorrection.pictogramIdAfter, YES_TILE_ID)
  assert.deepEqual(
    insertionCorrection.pictogramIdsBefore,
    [originalInsertPictogramId],
    'the insertion audit must preserve the original sequence'
  )
  assert.deepEqual(
    insertionCorrection.pictogramIdsAfter,
    [originalInsertPictogramId, YES_TILE_ID],
    'the insertion audit must preserve the inserted order'
  )
  assert.equal(
    insertionCorrection.isUsedForLearning,
    false,
    'manual insertion must remain audit-only'
  )
  const receiverRecordsAfterInsertion = JSON.parse(
    String(
      await callWx('getStorageSync', [
        'cboard_communication_receiver_records'
      ])
    )
  )
  const insertedDraft = receiverRecordsAfterInsertion.find(
    record =>
      record.recordStatus === 'draft' &&
      record.inputText === '想'
  )
  assert.ok(
    insertedDraft,
    'manual insertion must update the active receiver draft'
  )
  assert.deepEqual(
    insertedDraft.pictogramSequence.map(item => item.pictogramId),
    [originalInsertPictogramId, YES_TILE_ID],
    'the receiver draft must persist the inserted pictogram order'
  )
  assert.equal(
    insertedDraft.pictogramSequence[1].source,
    'manual',
    'the inserted pictogram must retain its manual source'
  )

  step('verifying visible correction memory management and audit retention')
  await tap('#receiver-correction-memory-toggle')
  await waitForSelector('#receiver-correction-memory-list')
  assert.equal(
    (await queryElements('.correction-memory-manager__row')).length,
    2,
    'the manager should show the learned replacement and tombstone'
  )
  await waitForText('.correction-memory-manager__token', '喝')
  const correctionsBeforeForget = JSON.parse(
    String(
      await callWx('getStorageSync', [
        'cboard_communication_receiver_corrections'
      ])
    )
  )
  await tap('#receiver-correction-memory-forget-0')
  await waitForText(
    '.correction-memory-manager__notice',
    '纠错审计仍会保留'
  )
  assert.equal(
    (await queryElements('.correction-memory-manager__row')).length,
    1,
    'forgetting one token should immediately remove only one active rule'
  )
  const correctionsAfterForget = JSON.parse(
    String(
      await callWx('getStorageSync', [
        'cboard_communication_receiver_corrections'
      ])
    )
  )
  assert.equal(
    correctionsAfterForget.length,
    correctionsBeforeForget.length,
    'forgetting must preserve every correction audit row'
  )
  const forgottenDeletion = correctionsAfterForget.find(
    correction =>
      correction.action === 'delete_pictogram' &&
      correction.originalToken === '喝'
  )
  assert.equal(
    forgottenDeletion?.isUsedForLearning,
    false,
    'the forgotten tombstone must remain as non-learning audit evidence'
  )
  await generateReceiverText('喝')
  assert.notEqual(
    await readReviewPictogramId(),
    '',
    'the forgotten tombstone must stop suppressing the local CBoard image'
  )

  step('verifying both directions in one conversation history')
  await tap('#express-mode-button')
  await waitForSelector('.communication-page')
  await ensureCaregiverToolsVisible()
  await tap('#history-manager-button')
  await waitForSelector('.history-manager')
  assert.equal(
    (await queryElements('.history-manager__row')).length,
    2,
    'the isolated history should contain one expression and one reception'
  )
  await waitForSelector('.history-row__direction--express')
  await waitForSelector('.history-row__direction--receive')
  await waitForText(
    '.history-row__feedback--understood',
    '患者反馈：明白了'
  )

  step('verifying private OBL and strict anonymized OBLA exports')
  const currentHistory = JSON.parse(
    String(await callWx('getStorageSync', ['cboard_communication_history']))
  )
  const privateTexts = currentHistory
    .flatMap(item => [item.sentence, item.inputText])
    .filter(value => typeof value === 'string' && value.trim())
  const privateIds = currentHistory
    .flatMap(item => [item.id, item.sessionId])
    .filter(value => typeof value === 'string' && value)
  const privateTimestamps = currentHistory
    .map(item => new Date(item.createdAt).toISOString())
  await mockWx('openDocument', { errMsg: 'openDocument:ok' })

  const filesBeforePrivateExport = await listCommunicationLogFiles()
  await tap('#history-export-open-board-log')
  await waitForText(
    '.storage-notice',
    '标准沟通日志已打开，请作为包含沟通原文的私密文件保管。'
  )
  const privateLogFileName = await retry(
    'the private Open Board Log export file',
    async () => {
      const files = await listCommunicationLogFiles()
      return files.find(fileName => !filesBeforePrivateExport.includes(fileName))
    },
    30_000
  )
  assert.ok(privateLogFileName.endsWith('.obl'))
  const privateLogText = String(
    await readCommunicationLogFile(privateLogFileName)
  )
  const privateLog = JSON.parse(privateLogText.slice(privateLogText.indexOf('{')))
  const privateLogEvents = privateLog.sessions.flatMap(session => session.events)
  assert.equal(privateLog.format, 'open-board-log-0.1')
  assert.equal(Object.hasOwn(privateLog, 'anonymized'), false)
  assert.ok(
    privateTexts.some(text => privateLogEvents.some(event => event.text === text)),
    'the private OBL export must retain at least one original communication text'
  )

  const filesBeforeAnonymizedExport = await listCommunicationLogFiles()
  await tap('#history-export-anonymized-open-board-log')
  await waitForText(
    '.storage-notice',
    '匿名研究日志已打开；原文已不可逆遮蔽，不能用于恢复对话。'
  )
  const anonymizedLogFileName = await retry(
    'the anonymized Open Board Log export file',
    async () => {
      const files = await listCommunicationLogFiles()
      return files.find(fileName => !filesBeforeAnonymizedExport.includes(fileName))
    },
    30_000
  )
  assert.ok(anonymizedLogFileName.endsWith('.obla'))
  const anonymizedLogText = String(
    await readCommunicationLogFile(anonymizedLogFileName)
  )
  const anonymizedLog = JSON.parse(
    anonymizedLogText.slice(anonymizedLogText.indexOf('{'))
  )
  const anonymizedEvents = anonymizedLog.sessions.flatMap(
    session => session.events
  )
  assert.equal(anonymizedLog.format, 'open-board-log-0.1')
  assert.equal(anonymizedLog.anonymized, true)
  assert.ok(
    anonymizedLog.sessions.every(session =>
      JSON.stringify(session.anonymizations) ===
      JSON.stringify(OPEN_BOARD_LOG_ANONYMIZATIONS)
    ),
    'every OBLA session must declare all nine OpenAAC anonymizations'
  )
  assert.ok(
    anonymizedEvents.every(
      event => /^:fringe-\d+$/.test(event.text) && event.redacted === true
    ),
    'every OBLA utterance must be irreversibly redacted'
  )
  for (const sensitiveValue of [
    ...privateTexts,
    ...privateIds,
    ...privateTimestamps,
    'ext_picinterpreter'
  ]) {
    assert.equal(
      anonymizedLogText.includes(sensitiveValue),
      false,
      `the OBLA export must not retain sensitive value: ${sensitiveValue}`
    )
  }
  await restoreWxMocks()
  await tap('.utility-page__back')

  step('verifying a new conversation does not erase prior history')
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await tap('#conversation-session-reset')
  await waitForText(
    '#conversation-session-notice',
    '原有历史仍会保留'
  )
  await restoreWxMocks()
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await ensureCaregiverToolsVisible()
  await tap('#history-manager-button')
  await waitForSelector('.history-manager')
  assert.equal(
    (await queryElements('.history-manager__row')).length,
    2,
    'page reconstruction must preserve both confirmed history records'
  )

  step('verifying a device-private image can resolve a missing token')
  await tap('.utility-page__back')
  await waitForSelector('.communication-page')
  await tap('#receiver-mode-button')
  await waitForSelector('#receiver-input')
  const privateMissingToken = '家里的药盒'
  await generateReceiverTextWithManualSegmentation(privateMissingToken)
  const privateMissingRecord = await retry(
    'the manually segmented missing-token record',
    async () => {
      const records = JSON.parse(
        String(await callWx('getStorageSync', [MISSING_TOKEN_STORAGE_KEY]))
      )
      return records.find(
        record =>
          record.normalizedToken === privateMissingToken &&
          record.status === 'new'
      ) || null
    }
  )
  const privateMissingAction =
    `#missing-token-private-image-${privateMissingRecord.id}`
  await waitForSelector(privateMissingAction)
  const tempMissingTokenImagePath =
    await createWechatTempPersonalImage()
  await mockWx(
    'chooseMedia',
    createCallbackWxMock(
      `{ tempFiles: [{ tempFilePath: '${tempMissingTokenImagePath}' }], errMsg: 'chooseMedia:ok' }`
    )
  )
  await tap(privateMissingAction)
  await waitForText(
    '#missing-token-notice',
    `已为「${privateMissingToken}」保存本机私有图片`
  )
  const privateMissingRecords = JSON.parse(
    String(await callWx('getStorageSync', [MISSING_TOKEN_STORAGE_KEY]))
  )
  const resolvedPrivateMissingRecord = privateMissingRecords.find(
    record => record.id === privateMissingRecord.id
  )
  assert.equal(resolvedPrivateMissingRecord.status, 'resolved')
  assert.equal(resolvedPrivateMissingRecord.source, 'device-private')
  assert.equal(resolvedPrivateMissingRecord.reviewedByCaregiver, true)
  assert.equal(
    resolvedPrivateMissingRecord.resolvedPictogramId,
    `device_private_missing_${privateMissingRecord.id}`
  )
  assert.equal(
    resolvedPrivateMissingRecord.resolvedPictogram.label,
    privateMissingToken
  )
  assert.equal(
    resolvedPrivateMissingRecord.resolvedPictogram.source.provider,
    'device-private'
  )
  assert.equal(
    resolvedPrivateMissingRecord.resolvedPictogram.source.license,
    '用户提供，仅限本机使用'
  )
  createdMissingTokenImagePath = String(
    resolvedPrivateMissingRecord.resolvedPictogram.image || ''
  )
  assert.ok(createdMissingTokenImagePath)
  assert.notEqual(
    createdMissingTokenImagePath,
    tempMissingTokenImagePath,
    'a missing-token image must use a persisted WeChat file'
  )
  assert.equal(
    (await inspectWechatSavedFile(createdMissingTokenImagePath)).exists,
    true,
    'the private missing-token image must exist before reuse'
  )
  await restoreWxMocks()

  await generateReceiverTextWithManualSegmentation(privateMissingToken)
  await waitForOuterWxml(
    '.review-list',
    createdMissingTokenImagePath
  )
  assert.equal(
    (await queryElements('.review-row__image')).length,
    1,
    'the next receiver match must render the private missing-token image'
  )
  const restorePrivateMissingAction =
    `#missing-token-restore-${privateMissingRecord.id}`
  await tap(restorePrivateMissingAction)
  await waitForText(
    '#missing-token-notice',
    '本机私图关联和图片文件已移除'
  )
  const restoredMissingRecords = JSON.parse(
    String(await callWx('getStorageSync', [MISSING_TOKEN_STORAGE_KEY]))
  )
  const restoredMissingRecord = restoredMissingRecords.find(
    record => record.id === privateMissingRecord.id
  )
  assert.equal(restoredMissingRecord.status, 'new')
  assert.equal(restoredMissingRecord.resolvedPictogramId, null)
  assert.equal(restoredMissingRecord.resolvedPictogram, null)
  assert.equal(
    (await inspectWechatSavedFile(createdMissingTokenImagePath)).exists,
    false,
    'restoring a missing token must delete its saved WeChat image'
  )
  createdMissingTokenImagePath = ''
  await generateReceiverTextWithManualSegmentation(privateMissingToken)
  await waitForSelector('.review-row__missing')
  await tap('#express-mode-button')
  await waitForSelector('.communication-page')

  step(
    'verifying device-private personal images through caregiver picture-library settings'
  )
  await openPersonalImageLibraryFromCaregiverSettings()
  await waitForSelector('.personal-image-card')
  const firstPersonalImageCard = await readOuterWxml(
    '.personal-image-card'
  )
  assert.ok(
    firstPersonalImageCard.includes(YES_TILE_LABEL) &&
      firstPersonalImageCard.includes('首页'),
    'the first default catalog card must be the root-board yes tile'
  )
  const tempPersonalImagePath = await createWechatTempPersonalImage()
  await mockWx(
    'chooseMedia',
    createCallbackWxMock(
      `{ tempFiles: [{ tempFilePath: '${tempPersonalImagePath}' }], errMsg: 'chooseMedia:ok' }`
    )
  )
  await tap(YES_PERSONAL_IMAGE_SELECT_ID)
  await waitForText(
    '.personal-image-manager__privacy',
    '已为「是」启用当前设备的熟悉图片'
  )
  const savedPersonalImages = JSON.parse(
    String(await callWx('getStorageSync', [PERSONAL_IMAGE_STORAGE_KEY]))
  )
  const patientId = String(
    await callWx('getStorageSync', ['cboard_communication_patient_id'])
  )
  assert.equal(savedPersonalImages.length, 1)
  const savedPersonalImage = savedPersonalImages[0]
  createdPersonalImagePath = String(savedPersonalImage.image || '')
  assert.ok(createdPersonalImagePath)
  assert.notEqual(createdPersonalImagePath, tempPersonalImagePath)
  assert.deepEqual(
    {
      contractVersion: savedPersonalImage.contractVersion,
      scope: savedPersonalImage.scope,
      tileId: savedPersonalImage.tileId,
      boardId: savedPersonalImage.boardId,
      labelSnapshot: savedPersonalImage.labelSnapshot,
      image: savedPersonalImage.image,
      patientId: savedPersonalImage.patientId,
      workspaceId: savedPersonalImage.workspaceId
    },
    {
      contractVersion: 1,
      scope: 'device-private',
      tileId: YES_TILE_ID,
      boardId: 'root',
      labelSnapshot: YES_TILE_LABEL,
      image: createdPersonalImagePath,
      patientId,
      workspaceId
    },
    'personal image storage must remain device-private and identity-scoped'
  )
  assert.deepEqual(
    savedPersonalImage.pictogramAttribution,
    {
      provider: 'device-private',
      originalId: `root:${YES_TILE_ID}`,
      name: YES_TILE_LABEL,
      license: '设备私有图片（未声明公开许可）',
      licenseUrl: null,
      author: null,
      authorUrl: null,
      sourceUrl: `device-private://personal-image/root/${YES_TILE_ID}`,
      repoKey: null
    },
    'personal image storage must retain its device-private attribution'
  )
  assert.equal(typeof savedPersonalImage.createdAt, 'number')
  assert.equal(typeof savedPersonalImage.updatedAt, 'number')
  await waitForProperty(
    '.personal-image-card__image',
    'src',
    createdPersonalImagePath
  )
  await restoreWxMocks()

  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForOuterWxml(
    `#expression-tile-${YES_TILE_ID}`,
    createdPersonalImagePath
  )

  step('verifying a device-private picture-library ZIP export')
  await openPictureLibraryBackupFromCaregiverSettings()
  assert.ok(
    (await readOuterWxml('#picture-library-scope-custom')).includes(
      'library-backup-option--active'
    ),
    'picture-library backup must default to the private custom scope'
  )
  await mockWx('shareFileMessage', { errMsg: 'shareFileMessage:ok' })
  const backupFilesBeforeExport = await listPictureLibraryBackupFiles()
  await tap('#picture-library-export-button')
  await waitForText(
    '#picture-library-backup-notice',
    '图库 ZIP 已生成，可转发或保存到其他位置。'
  )
  const pictureLibraryBackupFileName = await retry(
    'the exported picture-library ZIP file',
    async () => {
      const files = await listPictureLibraryBackupFiles()
      return files.find(fileName => !backupFilesBeforeExport.includes(fileName))
    },
    30_000
  )
  const pictureLibraryBackupFilePath =
    await getPictureLibraryBackupFilePath(pictureLibraryBackupFileName)
  const pictureLibraryBackupBase64 =
    await readPictureLibraryBackupFile(pictureLibraryBackupFileName)
  const pictureLibraryBackupZip = await JSZip.loadAsync(
    Buffer.from(pictureLibraryBackupBase64, 'base64')
  )
  const pictureLibraryManifestEntry =
    pictureLibraryBackupZip.file('library.json')
  assert.ok(pictureLibraryManifestEntry)
  const pictureLibraryManifest = JSON.parse(
    await pictureLibraryManifestEntry.async('text')
  )
  assert.equal(pictureLibraryManifest.format, 'picinterpreter-picture-library')
  assert.equal(pictureLibraryManifest.version, 1)
  assert.equal(pictureLibraryManifest.scope, 'custom')
  assert.equal(pictureLibraryManifest.boards.length, 0)
  assert.equal(pictureLibraryManifest.personalImagePreferences.length, 1)
  assert.equal(pictureLibraryManifest.stats.customPictureCount, 1)
  assert.equal(pictureLibraryManifest.stats.pictureAssetCount, 1)
  assert.equal(
    pictureLibraryManifest.personalImagePreferences[0].tileId,
    YES_TILE_ID
  )
  const archivedPersonalImagePath =
    pictureLibraryManifest.personalImagePreferences[0].image.path
  const archivedPersonalImage = pictureLibraryBackupZip.file(
    archivedPersonalImagePath
  )
  assert.ok(archivedPersonalImage)
  assert.ok((await archivedPersonalImage.async('uint8array')).byteLength > 0)
  await restoreWxMocks()
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')

  await openPersonalImageLibraryFromCaregiverSettings()
  await waitForSelector('.personal-image-card--active')
  const configuredPersonalImageCard = await readOuterWxml(
    '.personal-image-card--active'
  )
  assert.ok(
    configuredPersonalImageCard.includes(createdPersonalImagePath) &&
      configuredPersonalImageCard.includes('恢复默认'),
    'the restored personal image card must expose its file and fallback action'
  )
  await waitForSelector(YES_PERSONAL_IMAGE_RESTORE_ID)
  await waitForProperty(
    '.personal-image-card__image',
    'src',
    createdPersonalImagePath
  )
  await tap(YES_PERSONAL_IMAGE_RESTORE_ID)
  await waitForText(
    '.personal-image-manager__privacy',
    '「是」已恢复 CBoard 默认图片'
  )
  assert.deepEqual(
    JSON.parse(
      String(await callWx('getStorageSync', [PERSONAL_IMAGE_STORAGE_KEY]))
    ),
    [],
    'restoring the default must remove the private preference'
  )
  await waitForNoSelector(YES_PERSONAL_IMAGE_RESTORE_ID)
  await waitForProperty(
    '.personal-image-card__image',
    'src',
    YES_BACKUP_IMAGE
  )
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForOuterWxml(
    `#expression-tile-${YES_TILE_ID}`,
    YES_DEFAULT_IMAGE
  )
  assert.equal(
    (await inspectWechatSavedFile(createdPersonalImagePath)).exists,
    false,
    'restoring the default must remove the saved WeChat file'
  )
  createdPersonalImagePath = ''

  step('verifying restore from the exported private picture-library ZIP')
  await openPictureLibraryBackupFromCaregiverSettings()
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await mockWx(
    'chooseMessageFile',
    createCallbackWxMock(
      JSON.stringify({
        tempFiles: [
          {
            name: pictureLibraryBackupFileName,
            path: pictureLibraryBackupFilePath
          }
        ],
        errMsg: 'chooseMessageFile:ok'
      })
    )
  )
  await tap('#picture-library-import-button')
  await waitForText(
    '#picture-library-backup-notice',
    '图库恢复完成：1 张图片、0 段图卡录音，0 个沟通板。'
  )
  const restoredPersonalImages = JSON.parse(
    String(await callWx('getStorageSync', [PERSONAL_IMAGE_STORAGE_KEY]))
  )
  assert.equal(restoredPersonalImages.length, 1)
  const restoredPersonalImage = restoredPersonalImages[0]
  createdPersonalImagePath = String(restoredPersonalImage.image || '')
  createdPictureLibraryBackupAssetRoot =
    findPictureLibraryAssetRoot(createdPersonalImagePath)
  assert.ok(createdPersonalImagePath)
  assert.ok(createdPictureLibraryBackupAssetRoot)
  assert.notEqual(
    createdPersonalImagePath,
    savedPersonalImage.image,
    'restoring a ZIP must stage a new local asset instead of reviving a deleted path'
  )
  assert.deepEqual(
    {
      scope: restoredPersonalImage.scope,
      tileId: restoredPersonalImage.tileId,
      boardId: restoredPersonalImage.boardId,
      labelSnapshot: restoredPersonalImage.labelSnapshot,
      patientId: restoredPersonalImage.patientId,
      workspaceId: restoredPersonalImage.workspaceId
    },
    {
      scope: 'device-private',
      tileId: YES_TILE_ID,
      boardId: 'root',
      labelSnapshot: YES_TILE_LABEL,
      patientId,
      workspaceId
    },
    'restored private pictures must be rebound to the current device identity'
  )
  assert.ok(
    (await inspectWechatUserFile(createdPersonalImagePath)).size > 0,
    'the restored private image must exist in the WeChat user-data directory'
  )
  await restoreWxMocks()
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForOuterWxml(
    `#expression-tile-${YES_TILE_ID}`,
    createdPersonalImagePath
  )
  await openPersonalImageLibraryFromCaregiverSettings()
  await waitForSelector(YES_PERSONAL_IMAGE_RESTORE_ID)
  await tap(YES_PERSONAL_IMAGE_RESTORE_ID)
  await waitForText(
    '.personal-image-manager__privacy',
    '「是」已恢复 CBoard 默认图片'
  )
  assert.deepEqual(
    JSON.parse(
      String(await callWx('getStorageSync', [PERSONAL_IMAGE_STORAGE_KEY]))
    ),
    [],
    'the restored ZIP preference must still support the normal default reset'
  )
  assert.equal(
    (await inspectWechatUserFile(createdPersonalImagePath)).exists,
    false,
    'restoring the default must delete the ZIP-restored image file'
  )
  await removePictureLibraryAssetRoot(createdPictureLibraryBackupAssetRoot)
  createdPictureLibraryBackupAssetRoot = ''
  createdPersonalImagePath = ''
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  await waitForOuterWxml(
    `#expression-tile-${YES_TILE_ID}`,
    YES_DEFAULT_IMAGE
  )

  step('verifying a complete local-device ZIP export and restore')
  const deviceBackupTimestamp = 1700000000000
  const deviceBackupPhrase = {
    contractVersion: 1,
    id: 'phrase-device-backup',
    sentence: '完整备份常用语',
    output: [],
    usageCount: 1,
    createdAt: deviceBackupTimestamp,
    lastUsedAt: deviceBackupTimestamp,
    updatedAt: deviceBackupTimestamp
  }
  const deviceBackupTombstone = {
    id: 'phrase-device-deleted',
    deletedAt: deviceBackupTimestamp,
    deletedBy: 'local',
    serverVersion: 1,
    pending: true
  }
  const deviceBackupHistory = {
    contractVersion: 1,
    id: 'history-device-backup',
    direction: 'express',
    sentence: '完整备份沟通历史',
    labels: ['完整备份'],
    sessionId: 'session-device-backup',
    patientId,
    workspaceId,
    createdAt: deviceBackupTimestamp,
    updatedAt: deviceBackupTimestamp,
    isFavorite: false
  }
  const deviceBackupReceiver = {
    contractVersion: 1,
    id: 'receiver-device-backup',
    direction: 'receive',
    sentence: '完整备份接收记录',
    inputText: '完整备份接收记录',
    labels: ['完整备份'],
    recordStatus: 'confirmed',
    sessionId: 'session-device-backup',
    patientId,
    workspaceId,
    createdAt: deviceBackupTimestamp + 1,
    updatedAt: deviceBackupTimestamp + 1,
    isFavorite: false
  }
  const deviceBackupCorrection = {
    id: 'correction-device-backup',
    expressionId: deviceBackupReceiver.id,
    sessionId: deviceBackupReceiver.sessionId,
    patientId,
    workspaceId,
    userId: null,
    action: 'replace_pictogram',
    originalToken: '旧词',
    normalizedToken: '新词',
    sequenceIndexBefore: null,
    sequenceIndexAfter: null,
    pictogramIdBefore: null,
    pictogramIdAfter: null,
    pictogramIdsBefore: [],
    pictogramIdsAfter: [],
    isUsedForLearning: true,
    createdAt: deviceBackupTimestamp + 2
  }
  const deviceBackupFeedbackDraft = {
    contractVersion: 1,
    id: 'feedback-device-backup',
    sessionId: 'session-device-backup',
    outputSignature: 'output-device-backup',
    candidates: [
      { sentence: '完整备份候选句。', feedback: 'up' }
    ],
    createdAt: deviceBackupTimestamp + 3,
    updatedAt: deviceBackupTimestamp + 3
  }
  const setJsonStorage = (key, value) =>
    callWx('setStorageSync', [key, JSON.stringify(value)])
  await setJsonStorage(SAVED_PHRASE_STORAGE_KEY, [deviceBackupPhrase])
  await setJsonStorage(SAVED_PHRASE_TOMBSTONE_STORAGE_KEY, [
    deviceBackupTombstone
  ])
  await setJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY, [
    deviceBackupHistory
  ])
  await setJsonStorage(RECEIVER_RECORD_STORAGE_KEY, [
    deviceBackupReceiver
  ])
  await setJsonStorage(RECEIVER_CORRECTION_STORAGE_KEY, [
    deviceBackupCorrection
  ])
  await setJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY, [
    deviceBackupFeedbackDraft
  ])

  await openPictureLibraryBackupFromCaregiverSettings()
  await mockWx('shareFileMessage', { errMsg: 'shareFileMessage:ok' })
  const deviceBackupFilesBeforeExport =
    await listLocalDeviceDataBackupFiles()
  await tap('#local-device-data-export-button')
  await waitForText(
    '#picture-library-backup-notice',
    '完整本机数据 ZIP 已生成，可转发或保存到其他位置。',
    300_000
  )
  const localDeviceDataBackupFileName = await retry(
    'the exported complete local-device ZIP file',
    async () => {
      const files = await listLocalDeviceDataBackupFiles()
      return files.find(
        fileName => !deviceBackupFilesBeforeExport.includes(fileName)
      )
    },
    60_000
  )
  const localDeviceDataBackupFilePath =
    await getLocalDeviceDataBackupFilePath(localDeviceDataBackupFileName)
  const localDeviceDataBackupBase64 =
    await readLocalDeviceDataBackupFile(localDeviceDataBackupFileName)
  const localDeviceDataBackupZip = await JSZip.loadAsync(
    Buffer.from(localDeviceDataBackupBase64, 'base64')
  )
  const readDeviceBackupJson = async fileName => {
    const entry = localDeviceDataBackupZip.file(fileName)
    assert.ok(entry, `complete local-device ZIP must contain ${fileName}`)
    return JSON.parse(await entry.async('text'))
  }
  const localDeviceManifest = await readDeviceBackupJson('device-data.json')
  const localDeviceLibrary = await readDeviceBackupJson('library.json')
  const localDevicePictograms = await readDeviceBackupJson('pictograms.json')
  const localDeviceCategories = await readDeviceBackupJson('categories.json')
  const localDeviceExpressions = await readDeviceBackupJson('expressions.json')
  const findById = (items, id) =>
    (Array.isArray(items) ? items : []).find(item => item.id === id)
  assert.equal(localDeviceManifest.format, 'picinterpreter-local-device-data')
  assert.equal(localDeviceManifest.version, 1)
  assert.equal(localDeviceLibrary.scope, 'full')
  assert.ok(localDeviceLibrary.boards.length > 0)
  assert.equal(
    localDeviceManifest.stats.pictogramCount,
    localDevicePictograms.items.length
  )
  assert.equal(
    localDeviceManifest.stats.categoryCount,
    localDeviceCategories.items.length
  )
  assert.equal(
    findById(
      localDeviceExpressions.savedPhrases,
      deviceBackupPhrase.id
    )?.sentence,
    '完整备份常用语'
  )
  assert.equal(
    findById(
      localDeviceExpressions.savedPhraseTombstones,
      deviceBackupTombstone.id
    )?.id,
    deviceBackupTombstone.id
  )
  assert.equal(
    findById(
      localDeviceExpressions.history,
      deviceBackupHistory.id
    )?.id,
    deviceBackupHistory.id
  )
  assert.equal(
    findById(
      localDeviceExpressions.receiverRecords,
      deviceBackupReceiver.id
    )?.id,
    deviceBackupReceiver.id
  )
  assert.equal(
    findById(
      localDeviceExpressions.receiverCorrections,
      deviceBackupCorrection.id
    )?.id,
    deviceBackupCorrection.id
  )
  assert.equal(
    findById(
      localDeviceExpressions.expressionCandidateFeedbackDrafts,
      deviceBackupFeedbackDraft.id
    )?.id,
    deviceBackupFeedbackDraft.id
  )

  await setJsonStorage(SAVED_PHRASE_STORAGE_KEY, [
    { ...deviceBackupPhrase, sentence: '恢复前已被改写' }
  ])
  await setJsonStorage(SAVED_PHRASE_TOMBSTONE_STORAGE_KEY, [])
  await setJsonStorage(COMMUNICATION_HISTORY_STORAGE_KEY, [
    { ...deviceBackupHistory, sentence: '恢复前历史已被改写' }
  ])
  await setJsonStorage(RECEIVER_RECORD_STORAGE_KEY, [
    { ...deviceBackupReceiver, sentence: '恢复前接收记录已被改写' }
  ])
  await setJsonStorage(RECEIVER_CORRECTION_STORAGE_KEY, [])
  await setJsonStorage(FEEDBACK_DRAFT_STORAGE_KEY, [])
  await restoreWxMocks()
  await mockWx(
    'showModal',
    createCallbackWxMock(
      `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
    )
  )
  await mockWx(
    'chooseMessageFile',
    createCallbackWxMock(
      JSON.stringify({
        tempFiles: [
          {
            name: localDeviceDataBackupFileName,
            path: localDeviceDataBackupFilePath
          }
        ],
        errMsg: 'chooseMessageFile:ok'
      })
    )
  )
  await tap('#picture-library-import-button')
  await waitForText(
    '#picture-library-backup-notice',
    '完整本机数据恢复完成：',
    300_000
  )
  const restoredDevicePhrases = JSON.parse(
    String(await callWx('getStorageSync', [SAVED_PHRASE_STORAGE_KEY]))
  )
  const restoredDeviceTombstones = JSON.parse(
    String(
      await callWx('getStorageSync', [
        SAVED_PHRASE_TOMBSTONE_STORAGE_KEY
      ])
    )
  )
  const restoredDeviceHistory = JSON.parse(
    String(
      await callWx('getStorageSync', [COMMUNICATION_HISTORY_STORAGE_KEY])
    )
  )
  const restoredDeviceReceivers = JSON.parse(
    String(await callWx('getStorageSync', [RECEIVER_RECORD_STORAGE_KEY]))
  )
  const restoredDeviceCorrections = JSON.parse(
    String(
      await callWx('getStorageSync', [RECEIVER_CORRECTION_STORAGE_KEY])
    )
  )
  const restoredDeviceFeedbackDrafts = JSON.parse(
    String(await callWx('getStorageSync', [FEEDBACK_DRAFT_STORAGE_KEY]))
  )
  assert.equal(
    findById(restoredDevicePhrases, deviceBackupPhrase.id)?.sentence,
    '完整备份常用语'
  )
  assert.equal(
    findById(restoredDeviceTombstones, deviceBackupTombstone.id)?.id,
    deviceBackupTombstone.id
  )
  assert.equal(
    findById(restoredDeviceHistory, deviceBackupHistory.id)?.sentence,
    '完整备份沟通历史'
  )
  const restoredDeviceReceiver = findById(
    restoredDeviceReceivers,
    deviceBackupReceiver.id
  )
  assert.equal(restoredDeviceReceiver?.sentence, '完整备份接收记录')
  assert.equal(restoredDeviceReceiver?.patientId, patientId)
  assert.equal(restoredDeviceReceiver?.workspaceId, workspaceId)
  assert.equal(
    findById(restoredDeviceCorrections, deviceBackupCorrection.id)?.id,
    deviceBackupCorrection.id
  )
  assert.equal(
    findById(
      restoredDeviceFeedbackDrafts,
      deviceBackupFeedbackDraft.id
    )?.id,
    deviceBackupFeedbackDraft.id
  )
  const restoredDeviceBoards = await readStoredPictureLibraryBoards()
  const restoredDefaultImage = String(
    restoredDeviceBoards[0]?.tiles?.[0]?.image || ''
  )
  assert.ok(
    restoredDefaultImage.startsWith('/assets/cboard-default/'),
    'byte-identical default CBoard images must keep their packaged path'
  )
  createdLocalDeviceDataAssetRoot = findPictureLibraryAssetRoot(
    restoredDefaultImage
  )
  assert.ok(
    !createdLocalDeviceDataAssetRoot,
    'byte-identical default CBoard images must not be duplicated in user data'
  )
  await tap('#picture-library-reset-button')
  await waitForText(
    '#picture-library-backup-notice',
    '已恢复默认 CBoard 图库：'
  )
  await restoreWxMocks()
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')

  step('verifying the independent AAC import package and real OBF import')
  await openAacImportFromCaregiverSettings()
  const aacImportPage = await readOuterWxml('.aac-import-page')
  assert.ok(
    aacImportPage.includes('导入 AAC 沟通板') &&
      aacImportPage.includes('Open Board Format') &&
      aacImportPage.includes('AACTools'),
    'the AAC import package must disclose the reused open standards and processors'
  )
  assert.ok(
    (await readOuterWxml('#picture-library-conflict-merge')).includes(
      'aac-import-option--active'
    ),
    'AAC import must default to the explicit import-file-first strategy'
  )
  await tap('#picture-library-conflict-skip')
  await retry('the AAC local-content-first conflict strategy', async () =>
    (await readOuterWxml('#picture-library-conflict-skip')).includes(
      'aac-import-option--active'
    )
      ? true
      : null
  )
  assert.equal(
    (await readOuterWxml('#picture-library-conflict-merge')).includes(
      'aac-import-option--active'
    ),
    false,
    'only one AAC conflict strategy may be active'
  )
  await tap('#picture-library-conflict-merge')
  await retry('the restored AAC import-file-first strategy', async () =>
    (await readOuterWxml('#picture-library-conflict-merge')).includes(
      'aac-import-option--active'
    )
      ? true
      : null
  )
  await prepareAacImportFixture(
    AAC_IMPORT_TEST_FILE_NAME,
    createWechatOpenBoardFixture
  )
  await tap('#open-board-import-button')
  await waitForText(
    '#open-board-import-notice',
    '已导入 1 个 OBF 沟通板、1 张图卡'
  )
  const importedBoard = await retry(
    'the OBF board in the real WeChat picture-library file store',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      return Array.isArray(boards)
        ? boards.find(board => board.name === AAC_IMPORT_TEST_BOARD_NAME)
        : null
    }
  )
  assert.equal(importedBoard.tiles.length, 1)
  assert.equal(importedBoard.tiles[0].label, AAC_IMPORT_TEST_TILE_LABEL)
  assert.equal(importedBoard.tiles[0].vocalization, AAC_IMPORT_TEST_TILE_LABEL)
  assert.match(
    importedBoard.tiles[0].image,
    /^(?:wxfile:\/\/usr|http:\/\/usr)\/picture-library\//
  )
  const importedImageFile = await inspectWechatUserFile(
    importedBoard.tiles[0].image
  )
  assert.equal(importedImageFile.exists, true)
  assert.ok(importedImageFile.size > 0)
  createdAacImportAssetRoot = findAacImportAssetRoot([importedBoard])
  assert.ok(
    createdAacImportAssetRoot,
    'the imported image must stay inside an isolated picture-library root'
  )
  await cleanupAacImportFixture()

  step('verifying linked OBZ boards, image, sound, and navigation storage')
  await prepareAacImportFixture(
    AAC_IMPORT_TEST_OBZ_FILE_NAME,
    createWechatOpenBoardArchiveFixture
  )
  await tap('#open-board-import-button')
  await waitForText(
    '#open-board-import-notice',
    '已导入 2 个 OBF 沟通板、3 张图卡'
  )
  const importedObzBoards = await retry(
    'the linked OBZ boards in the real WeChat picture-library store',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      const home = Array.isArray(boards)
        ? boards.find(board => board.name === AAC_IMPORT_TEST_OBZ_HOME_NAME)
        : null
      const more = Array.isArray(boards)
        ? boards.find(board => board.name === AAC_IMPORT_TEST_OBZ_MORE_NAME)
        : null
      return home && more ? { home, more } : null
    }
  )
  const waterTile = importedObzBoards.home.tiles.find(
    tile => tile.label === '水'
  )
  const moreTile = importedObzBoards.home.tiles.find(
    tile => tile.label === '更多'
  )
  assert.ok(waterTile)
  assert.ok(moreTile)
  assert.equal(waterTile.vocalization, AAC_IMPORT_TEST_TILE_LABEL)
  assert.equal(moreTile.loadBoardId, importedObzBoards.more.id)
  assert.match(
    waterTile.image,
    /^(?:wxfile:\/\/usr|http:\/\/usr)\/picture-library\//
  )
  assert.match(
    waterTile.sound,
    /^(?:wxfile:\/\/usr|http:\/\/usr)\/picture-library\//
  )
  const importedObzImageFile = await inspectWechatUserFile(waterTile.image)
  const importedObzSoundFile = await inspectWechatUserFile(waterTile.sound)
  assert.equal(importedObzImageFile.exists, true)
  assert.ok(importedObzImageFile.size > 0)
  assert.equal(importedObzSoundFile.exists, true)
  assert.ok(importedObzSoundFile.size > 44)
  createdAacImportAssetRoot = findAacImportAssetRoot([
    importedObzBoards.home
  ])
  assert.ok(createdAacImportAssetRoot)
  assert.ok(waterTile.sound.startsWith(`${createdAacImportAssetRoot}/`))
  await cleanupAacImportFixture()

  step('verifying an AsTeRICS GRD with image and linked navigation')
  await prepareAacImportFixture(
    AAC_IMPORT_TEST_GRD_FILE_NAME,
    createWechatAstericsGridFixture
  )
  await tap('#open-board-import-button')
  await waitForText(
    '#open-board-import-notice',
    '已导入 2 个 OBF 沟通板、3 张图卡'
  )
  const importedGrdBoards = await retry(
    'the linked GRD boards in the real WeChat picture-library store',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      const home = Array.isArray(boards)
        ? boards.find(board => board.name === AAC_IMPORT_TEST_GRD_HOME_NAME)
        : null
      const more = Array.isArray(boards)
        ? boards.find(board => board.name === AAC_IMPORT_TEST_GRD_MORE_NAME)
        : null
      return home && more ? { home, more } : null
    }
  )
  const grdWaterTile = importedGrdBoards.home.tiles.find(
    tile => tile.label === '喝水'
  )
  const grdMoreTile = importedGrdBoards.home.tiles.find(
    tile => tile.label === '更多'
  )
  assert.ok(grdWaterTile)
  assert.ok(grdMoreTile)
  assert.equal(grdWaterTile.vocalization, AAC_IMPORT_TEST_TILE_LABEL)
  assert.equal(grdMoreTile.loadBoardId, importedGrdBoards.more.id)
  assert.equal(importedGrdBoards.more.tiles[0].label, '厕所')
  const importedGrdImageFile = await inspectWechatUserFile(
    grdWaterTile.image
  )
  assert.equal(importedGrdImageFile.exists, true)
  assert.ok(importedGrdImageFile.size > 0)
  createdAacImportAssetRoot = findAacImportAssetRoot([
    importedGrdBoards.home
  ])
  assert.ok(createdAacImportAssetRoot)
  await cleanupAacImportFixture()

  step('verifying an unencrypted Gridset layout and embedded image')
  await prepareAacImportFixture(
    AAC_IMPORT_TEST_GRIDSET_FILE_NAME,
    createWechatGridsetFixture
  )
  await tap('#open-board-import-button')
  await waitForText(
    '#open-board-import-notice',
    '已导入 1 个 OBF 沟通板、2 张图卡'
  )
  const importedGridsetBoard = await retry(
    'the Gridset board in the real WeChat picture-library store',
    async () => {
      const boards = await readStoredPictureLibraryBoards()
      return Array.isArray(boards)
        ? boards.find(
            board => board.name === AAC_IMPORT_TEST_GRIDSET_BOARD_NAME
          )
        : null
    }
  )
  assert.equal(importedGridsetBoard.layout.rows, 1)
  assert.equal(importedGridsetBoard.layout.columns, 2)
  assert.deepEqual(
    importedGridsetBoard.layout.tileIds,
    importedGridsetBoard.tiles.map(tile => tile.id)
  )
  assert.equal(importedGridsetBoard.tiles[0].label, '喝水')
  assert.equal(importedGridsetBoard.tiles[0].vocalization, '我想喝水')
  assert.equal(importedGridsetBoard.tiles[1].label, '帮助')
  assert.equal(importedGridsetBoard.tiles[1].vocalization, '需要帮助')
  const importedGridsetImageFile = await inspectWechatUserFile(
    importedGridsetBoard.tiles[0].image
  )
  assert.equal(importedGridsetImageFile.exists, true)
  assert.ok(importedGridsetImageFile.size > 0)
  createdAacImportAssetRoot = findAacImportAssetRoot([
    importedGridsetBoard
  ])
  assert.ok(createdAacImportAssetRoot)
  await cleanupAacImportFixture()

  if (runServerAacScenario) {
    step('verifying authenticated Snap and TouchChat server conversion')
    const originalAacUploadTempFiles = await listAacUploadTempFiles()
    await callWx('setStorageSync', [
      CBOARD_AUTH_TOKEN_STORAGE_KEY,
      'e2e-server-aac-token'
    ])

    const serverFormats = [
      {
        fileName: 'picinterpreter-aac-import-e2e.sps',
        data: 'U1FMaXRlIGZvcm1hdCAzAA==',
        boardName: '图语家 Snap 运行首页',
        label: '我要喝水',
        format: 'snap'
      },
      {
        fileName: 'picinterpreter-aac-import-e2e.ce',
        data: 'VENIQVQgcnVudGltZSBlMmU=',
        boardName: '图语家 TouchChat 运行首页',
        label: '需要帮助',
        format: 'touchchat'
      }
    ]

    for (const serverFormat of serverFormats) {
      await prepareAacImportFixture(
        serverFormat.fileName,
        () =>
          createWechatOpaqueAacFixture(
            serverFormat.fileName,
            serverFormat.data
          )
      )
      await mockServerAacUpload(serverFormat)
      await tap('#open-board-import-button')
      const serverImportNotice = await retry(
        `the ${serverFormat.format} import result notice`,
        async () => {
          const notice = await readText('#open-board-import-notice')
          return notice.trim() ? notice : null
        }
      )
      assert.ok(
        serverImportNotice.includes('已导入 1 个 OBF 沟通板、1 张图卡'),
        `${serverFormat.format} import failed with notice: ${serverImportNotice}`
      )
      const importedServerBoard = await retry(
        `the ${serverFormat.format} board in the real WeChat picture-library store`,
        async () => {
          const boards = await readStoredPictureLibraryBoards()
          return Array.isArray(boards)
            ? boards.find(board => board.name === serverFormat.boardName)
            : null
        }
      )
      assert.equal(importedServerBoard.tiles.length, 1)
      assert.equal(importedServerBoard.tiles[0].label, serverFormat.label)
      assert.equal(
        importedServerBoard.tiles[0].vocalization,
        serverFormat.label
      )
      await cleanupAacImportFixture()
    }

    assert.deepEqual(
      await listAacUploadTempFiles(),
      originalAacUploadTempFiles,
      'Snap and TouchChat upload files must be removed after conversion'
    )
    await callWx('removeStorageSync', [CBOARD_AUTH_TOKEN_STORAGE_KEY])
  }
  await tap('#aac-import-back-button')
  await waitForSelector('.library-backup-page')
  await navigate('reLaunch', '/pages/index/index')
  await waitForSelector('.communication-page')
  }

  if (runAccountSyncScenario) {
    step('verifying isolated CBoard account login, cloud merge, and logout')
    await callWx('setStorageSync', [
      'cboard_communication_history',
      JSON.stringify([{
        id: 'account-e2e-local-history',
        contractVersion: 1,
        direction: 'express',
        sentence: '本地沟通记录',
        labels: ['本地沟通记录'],
        output: [],
        candidateSentences: ['本地沟通记录'],
        createdAt: 100
      }])
    ])
    if (!accountFakeApiControlUrl) {
      await mockWx(
        'request',
        `function(options) {
        var url = '';
        var method = 'GET';
        var header = {};
        var data = {};
        if (options) {
          if (options.url) url = String(options.url);
          if (options.method) method = String(options.method).toUpperCase();
          if (options.header) header = options.header;
          if (options.data) data = options.data;
        }
        var log = wx.getStorageSync('${ACCOUNT_REQUEST_LOG_STORAGE_KEY}');
        if (!Array.isArray(log)) log = [];
        log.push({
          url: url,
          method: method,
          authorized: Boolean(header.Authorization),
          dataKeys: Object.keys(data),
          containsDevicePrivate: JSON.stringify(data).includes('device-private')
        });
        wx.setStorageSync('${ACCOUNT_REQUEST_LOG_STORAGE_KEY}', log);
        var response = { statusCode: 404, data: { message: 'Unexpected E2E API request.' } };
        if (url.endsWith('/user/login')) {
          if (method === 'POST') {
            response = {
              statusCode: 200,
              data: {
                id: 'account-e2e-user',
                name: '同步测试照护者',
                email: 'sync-caregiver@example.test',
                authToken: 'e2e-account-token',
                settings: {}
              }
            };
          }
        } else if (url.endsWith('/pictograms/search')) {
          if (method === 'POST') {
            var requestedTokens = Array.isArray(data.tokens) ? data.tokens : [];
            response = {
              statusCode: 200,
              data: {
                results: requestedTokens.map(function(token, index) {
                  return {
                    token: token,
                    pictogram: {
                      id: 'runtime_opensymbols_e2e_' + index,
                      imageUrl: '/pictograms/opensymbols/e2e-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image',
                      labels: { zh: [token], en: ['rehabilitation'] },
                      source: {
                        provider: 'opensymbols',
                        originalId: 'mulberry-e2e-' + index,
                        name: 'OpenSymbols / mulberry',
                        license: 'CC BY-SA 2.0 UK',
                        licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/uk/',
                        author: 'Paxtoncrafts Charitable Trust',
                        authorUrl: 'https://mulberrysymbols.org/',
                        sourceUrl: 'https://www.opensymbols.org/symbols/mulberry/e2e',
                        repoKey: 'mulberry'
                      }
                    }
                  };
                })
              }
            };
          }
        } else if (url.endsWith('/settings')) {
          if (method === 'GET') {
            response = {
              statusCode: 200,
              data: {
                communicationSupport: {
                  savedPhrases: [{
                    id: 'account-e2e-remote-phrase',
                    sentence: '云端同步短语',
                    output: [],
                    usageCount: 0,
                    createdAt: 100,
                    lastUsedAt: 100,
                    updatedAt: 100
                  }],
                  history: []
                }
              }
            };
          } else if (method === 'POST') {
            response = { statusCode: 200, data: {} };
          }
        } else if (url.endsWith('/communication/receiver-records/sync')) {
          if (method === 'POST') {
            response = {
              statusCode: 200,
              data: {
                acceptedCount: Array.isArray(data.records) ? data.records.length : 0,
                records: Array.isArray(data.records) ? data.records : [],
                deletedRecordIds: []
              }
            };
          }
        }
        if (options) {
          if (typeof options.success === 'function') options.success(response);
          if (typeof options.complete === 'function') options.complete(response);
        }
        return response;
        }`
      )
    }
    step('verifying OpenSymbols attribution, caregiver confirmation, and offline cache')
    const onlinePictogramToken = '康复训练图'
    if (!accountFakeApiControlUrl) {
      const onlinePictogramTempPath =
        await createWechatTempPersonalImage()
      await mockWx(
        'downloadFile',
        createCallbackWxMock(
          `{ statusCode: 200, tempFilePath: '${onlinePictogramTempPath}', errMsg: 'downloadFile:ok' }`
        )
      )
    }
    const onlinePreferences = JSON.parse(
      String(
        await callWx('getStorageSync', [
          'cboard_communication_preferences'
        ])
      )
    )
    await callWx('setStorageSync', [
      'cboard_communication_preferences',
      JSON.stringify({
        ...onlinePreferences,
        onlinePictogramSearchEnabled: true
      })
    ])
    await navigate('reLaunch', '/packages/caregiver/pages/receiver/index')
    await waitForSelector('#receiver-input')
    await waitForText(
      '#missing-token-online-status',
      '联网时只发送单个缺词'
    )
    await generateReceiverTextWithManualSegmentation(onlinePictogramToken)
    await retry(
      'a persisted or suggested missing-token record for the OpenSymbols probe',
      async () => {
        const records = JSON.parse(
          String(
            await callWx('getStorageSync', [
              MISSING_TOKEN_STORAGE_KEY
            ])
          )
        )
        return records.find(
          record =>
            record.normalizedToken === onlinePictogramToken &&
            (
              record.status === 'new' ||
              record.status === 'suggested'
            )
        ) || null
      }
    )
    const onlineSearchRequest = await retry(
      'an OpenSymbols search request',
      async () => {
        const requestLog = await readAccountRequestLog()
        return requestLog.find(entry =>
          entry.url.endsWith('/pictograms/search')
        ) || null
      }
    )
    assert.equal(onlineSearchRequest.method, 'POST')
    assert.deepEqual(onlineSearchRequest.dataKeys, ['tokens'])
    assert.equal(onlineSearchRequest.authorized, false)
    assert.equal(onlineSearchRequest.containsDevicePrivate, false)
    const suggestedOnlineRecord = await retry(
      'an OpenSymbols missing-token suggestion',
      async () => {
        const records = JSON.parse(
          String(
            await callWx('getStorageSync', [
              MISSING_TOKEN_STORAGE_KEY
            ])
          )
        )
        return records.find(
          record =>
            record.normalizedToken === onlinePictogramToken &&
            record.status === 'suggested' &&
            record.suggestedPictogram &&
            record.suggestedPictogram.source.provider === 'opensymbols'
        ) || null
      }
    )
    await waitForText(
      '.missing-queue__online-source',
      'OpenSymbols / mulberry · CC BY-SA 2.0 UK'
    )
    await tap(
      `#missing-token-accept-online-${suggestedOnlineRecord.id}`
    )
    await waitForText(
      '#missing-token-notice',
      '图片已确认并保存到本机'
    )
    const resolvedOnlineRecord = await retry(
      'the locally cached OpenSymbols resolution',
      async () => {
        const records = JSON.parse(
          String(
            await callWx('getStorageSync', [
              MISSING_TOKEN_STORAGE_KEY
            ])
          )
        )
        return records.find(
          record =>
            record.id === suggestedOnlineRecord.id &&
            record.status === 'resolved'
        ) || null
      }
    )
    assert.equal(resolvedOnlineRecord.source, 'online:opensymbols')
    assert.equal(
      resolvedOnlineRecord.resolvedPictogram.source.license,
      'CC BY-SA 2.0 UK'
    )
    createdOnlinePictogramPath = String(
      resolvedOnlineRecord.resolvedPictogram.image || ''
    )
    assert.ok(
      createdOnlinePictogramPath,
      'the accepted OpenSymbols candidate must have a local file'
    )
    assert.equal(
      (await inspectWechatSavedFile(createdOnlinePictogramPath)).exists,
      true,
      'the accepted OpenSymbols image must exist before storage restoration'
    )
    await waitForText(
      '.storage-notice',
      '已应用照护者确认的缺词图片'
    )
    await tap('#receiver-open-display-button')
    await waitForText(
      '#receiver-display-attribution',
      'OpenSymbols / mulberry'
    )
    await waitForText(
      '#receiver-display-attribution',
      'CC BY-SA 2.0 UK'
    )
    const attributedReceiverRecord = await retry(
      'a v2 receiver record with OpenSymbols attribution',
      async () => {
        const records = JSON.parse(
          String(
            await callWx('getStorageSync', [
              RECEIVER_RECORD_STORAGE_KEY
            ])
          )
        )
        return records.find(
          record =>
            record.inputText === onlinePictogramToken &&
            record.recordStatus === 'confirmed' &&
            record.pictogramSequence &&
            record.pictogramSequence[0] &&
            record.pictogramSequence[0].attribution
          ) || null
      }
    )
    assert.equal(attributedReceiverRecord.contractVersion, 2)
    assert.equal(
      attributedReceiverRecord.pictogramSequence[0].source,
      'opensymbols'
    )
    assert.equal(
      attributedReceiverRecord.pictogramSequence[0].attribution.repoKey,
      'mulberry'
    )
    await tap('#receiver-display-back')
    await waitForSelector(
      `#missing-token-restore-${resolvedOnlineRecord.id}`
    )
    await tap(`#missing-token-restore-${resolvedOnlineRecord.id}`)
    await waitForText(
      '#missing-token-notice',
      '在线图片缓存和关联已移除'
    )
    assert.equal(
      (await inspectWechatSavedFile(createdOnlinePictogramPath)).exists,
      false,
      'restoring an online resolution must delete its cached WeChat file'
    )
    createdOnlinePictogramPath = ''
    await tap('#express-mode-button')
    await waitForSelector('.communication-page')
    await ensureCaregiverToolsVisible()
    await tap('#communication-settings-button')
    await waitForSelector('#account-login-button')
    await mockWx(
      'showModal',
      createCallbackWxMock(
        `{ confirm: true, cancel: false, errMsg: 'showModal:ok' }`
      )
    )
    await input('#account-email-input', 'sync-caregiver@example.test')
    await input('#account-password-input', 'e2e-password')
    await tap('#account-login-button')
    await waitForSelector('#account-sync-button')
    await waitForText('#account-sync-notice', '登录成功')

    const storedSession = JSON.parse(
      String(
        await callWx('getStorageSync', [
          CBOARD_ACCOUNT_SESSION_STORAGE_KEY
        ])
      )
    )
    assert.equal(storedSession.token, 'e2e-account-token')
    assert.equal(storedSession.user.email, 'sync-caregiver@example.test')
    assert.equal(
      await callWx('getStorageSync', [CBOARD_AUTH_TOKEN_STORAGE_KEY]),
      'e2e-account-token',
      'the compatibility token must be written with the normalized session'
    )
    const mergedPhrases = JSON.parse(
      String(
        await callWx('getStorageSync', [
          'cboard_communication_saved_phrases'
        ])
      )
    )
    assert.ok(
      mergedPhrases.some(phrase => phrase.sentence === '云端同步短语'),
      'login must merge the remote saved phrase into the local repository'
    )
    const requestLog = await readAccountRequestLog()
    const pictogramRequests = requestLog.filter(entry =>
      entry.url.endsWith('/pictograms/search')
    )
    assert.ok(
      pictogramRequests.length >= 1 &&
      pictogramRequests.every(entry =>
        entry.dataKeys.length === 1 &&
        entry.dataKeys[0] === 'tokens' &&
        !entry.authorized &&
        !entry.containsDevicePrivate
      ),
      'online pictogram requests must send only missing tokens without account data'
    )
    assert.ok(
      requestLog.some(entry =>
        entry.url.endsWith('/user/login') && !entry.authorized
      ),
      'the login request must not carry an old bearer token'
    )
    const protectedRequests = requestLog.filter(entry =>
      entry.url.endsWith('/settings') ||
      entry.url.endsWith('/communication/saved-phrases/sync') ||
      entry.url.endsWith('/communication/receiver-records/sync')
    )
    assert.ok(
      protectedRequests.length >= 4 &&
      protectedRequests.every(entry => entry.authorized),
      'every cloud settings and confirmed-record request must be authenticated'
    )
    assert.ok(
      requestLog.every(entry => !entry.containsDevicePrivate),
      'device-private image data must not enter account synchronization'
    )
    const historyBeforeLogout = await callWx('getStorageSync', [
      'cboard_communication_history'
    ])
    await tap('#account-delete-open-button')
    await waitForSelector('#account-delete-confirmation-input')
    await input('#account-delete-confirmation-input', 'delete-account')
    await tap('#account-delete-confirm-button')
    await waitForSelector('#account-login-button')
    await waitForText('#account-sync-notice', '云端账号已永久删除')
    assert.equal(
      String(
        await callWx('getStorageSync', [
          CBOARD_ACCOUNT_SESSION_STORAGE_KEY
        ]) || ''
      ),
      ''
    )
    assert.equal(
      String(
        await callWx('getStorageSync', [CBOARD_AUTH_TOKEN_STORAGE_KEY]) ||
        ''
      ),
      ''
    )
    assert.equal(
      await callWx('getStorageSync', ['cboard_communication_history']),
      historyBeforeLogout,
      'account deletion must preserve local communication history'
    )
    const requestsAfterAccountDeletion = await readAccountRequestLog()
    assert.ok(
      requestsAfterAccountDeletion.some(entry =>
        entry.url.endsWith('/account/account-e2e-user') &&
        entry.method === 'DELETE' &&
        entry.authorized
      ),
      'account deletion must use the existing authenticated CBoard endpoint'
    )
    await tap('.utility-page__back')
    await waitForSelector('.communication-page')
  }

  const consoleErrors = await invokeTool('get_simulator_console', {
    project: projectPath,
    command: 'grep -i error'
  })
  const unexpectedConsoleErrors =
    unexpectedSimulatorConsoleErrors(consoleErrors)
  assert.equal(
    unexpectedConsoleErrors,
    '',
    'simulator console should not contain error logs'
  )
  scenarioPassed = true
  }
} catch (error) {
  if (projectOpened) {
    try {
      const failureScreenshot = path.join(
        tempDirectory,
        'cboard-wechat-skill-smoke-failure.png'
      )
      mkdirSync(tempDirectory, { recursive: true })
      await invokeTool('simulator_screenshot', {
        project: projectPath,
        path: failureScreenshot
      })
      process.stderr.write(
        `[weapp-skill-smoke] failure screenshot: ${failureScreenshot}\n`
      )
    } catch (screenshotError) {
      process.stderr.write(
        `[weapp-skill-smoke] screenshot warning: ${screenshotError.message}\n`
      )
    }
  }
  process.stderr.write(
    `[weapp-skill-smoke] FAIL: ${error.stack || error.message}\n`
  )
  process.exitCode = 1
} finally {
  if (projectOpened && mockedWxMethods.size) {
    try {
      await restoreWxMocks()
      step('restored WeChat API mocks')
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] wx API restore warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && originalCommunicationLogFiles) {
    try {
      const currentFiles = await listCommunicationLogFiles()
      const createdFiles = currentFiles.filter(
        fileName => !originalCommunicationLogFiles.includes(fileName)
      )
      for (const fileName of createdFiles) {
        assert.equal(
          await removeCommunicationLogFile(fileName),
          true,
          `failed to remove E2E communication log file: ${fileName}`
        )
      }
      if (createdFiles.length) {
        step(`removed ${createdFiles.length} E2E communication log files`)
      }
      originalCommunicationLogFiles = null
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] communication log cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && originalPictureLibraryBackupFiles) {
    try {
      const currentFiles = await listPictureLibraryBackupFiles()
      const createdFiles = currentFiles.filter(
        fileName => !originalPictureLibraryBackupFiles.includes(fileName)
      )
      for (const fileName of createdFiles) {
        assert.equal(
          await removePictureLibraryBackupFile(fileName),
          true,
          `failed to remove E2E picture-library backup: ${fileName}`
        )
      }
      if (createdFiles.length) {
        step(`removed ${createdFiles.length} E2E picture-library backup`)
      }
      originalPictureLibraryBackupFiles = null
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] picture-library backup cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && originalLocalDeviceDataBackupFiles) {
    try {
      const currentFiles = await listLocalDeviceDataBackupFiles()
      const createdFiles = currentFiles.filter(
        fileName => !originalLocalDeviceDataBackupFiles.includes(fileName)
      )
      for (const fileName of createdFiles) {
        assert.equal(
          await removeLocalDeviceDataBackupFile(fileName),
          true,
          `failed to remove E2E local-device backup: ${fileName}`
        )
      }
      if (createdFiles.length) {
        step(`removed ${createdFiles.length} E2E local-device backup`)
      }
      originalLocalDeviceDataBackupFiles = null
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] local-device backup cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && originalStorage && !createdPersonalImagePath) {
    try {
      const currentPersonalImages = JSON.parse(
        String(await callWx('getStorageSync', [PERSONAL_IMAGE_STORAGE_KEY]))
      )
      createdPersonalImagePath = String(
        currentPersonalImages[0]?.image || ''
      )
    } catch (error) {
      createdPersonalImagePath = ''
    }
  }
  if (
    projectOpened &&
    createdPersonalImagePath &&
    !createdPictureLibraryBackupAssetRoot
  ) {
    createdPictureLibraryBackupAssetRoot =
      findPictureLibraryAssetRoot(createdPersonalImagePath)
  }
  if (projectOpened && createdPictureLibraryBackupAssetRoot) {
    try {
      await removePictureLibraryAssetRoot(
        createdPictureLibraryBackupAssetRoot
      )
      step('removed the E2E picture-library restore asset root')
      createdPictureLibraryBackupAssetRoot = ''
      createdPersonalImagePath = ''
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] picture-library restore cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && createdLocalDeviceDataAssetRoot) {
    try {
      await removePictureLibraryAssetRoot(createdLocalDeviceDataAssetRoot)
      createdLocalDeviceDataAssetRoot = ''
      step('removed the E2E complete-device restore asset directory')
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] complete-device asset cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (
    projectOpened &&
    originalStorage &&
    !createdMissingTokenImagePath
  ) {
    try {
      const currentMissingTokens = JSON.parse(
        String(await callWx('getStorageSync', [MISSING_TOKEN_STORAGE_KEY]))
      )
      const privateRecord = currentMissingTokens.find(
        record =>
          record.source === 'device-private' &&
          record.resolvedPictogram &&
          record.resolvedPictogram.image
      )
      createdMissingTokenImagePath = String(
        (privateRecord && privateRecord.resolvedPictogram.image) || ''
      )
    } catch (error) {
      createdMissingTokenImagePath = ''
    }
  }
  if (projectOpened && createdMissingTokenImagePath) {
    try {
      await removeWechatSavedFile(createdMissingTokenImagePath)
      step('removed the E2E missing-token image file')
      createdMissingTokenImagePath = ''
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] missing-token image cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (
    projectOpened &&
    originalStorage &&
    !createdOnlinePictogramPath
  ) {
    try {
      const currentMissingTokens = JSON.parse(
        String(await callWx('getStorageSync', [MISSING_TOKEN_STORAGE_KEY]))
      )
      const onlineRecord = currentMissingTokens.find(
        record =>
          record.source === 'online:opensymbols' &&
          record.resolvedPictogram &&
          record.resolvedPictogram.image
      )
      createdOnlinePictogramPath = String(
        (onlineRecord && onlineRecord.resolvedPictogram.image) || ''
      )
    } catch (error) {
      createdOnlinePictogramPath = ''
    }
  }
  if (projectOpened && createdOnlinePictogramPath) {
    try {
      await removeWechatSavedFile(createdOnlinePictogramPath)
      step('removed the E2E OpenSymbols image file')
      createdOnlinePictogramPath = ''
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] OpenSymbols image cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && createdPersonalImagePath) {
    try {
      await removeWechatSavedFile(createdPersonalImagePath)
      step('removed the E2E personal image file')
      createdPersonalImagePath = ''
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] personal image cleanup warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && originalPictureLibraryFiles) {
    try {
      if (aacImportAttempted && !createdAacImportAssetRoot) {
        createdAacImportAssetRoot = findAacImportAssetRoot(
          await readStoredPictureLibraryBoards()
        )
      }
      await removePictureLibraryAssetRoot(createdAacImportAssetRoot)
      createdAacImportAssetRoot = ''
      await restorePictureLibraryFiles(
        originalPictureLibraryFiles,
        createdAacImportFixturePath
      )
      originalPictureLibraryFiles = null
      createdAacImportFixturePath = ''
      aacImportAttempted = false
      step('restored the original picture-library files')
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] picture-library restore warning: ${error.message}\n`
      )
      process.exitCode = 1
    }
  }
  if (projectOpened && originalStorage) {
    try {
      await restoreStorage(originalStorage)
      await navigate('reLaunch', '/pages/index/index')
      removeStorageRecovery()
      step(`restored ${originalStorage.length} original storage entries`)
    } catch (error) {
      process.stderr.write(
        `[weapp-skill-smoke] storage restore warning: ${error.message}; ` +
        `recovery retained at ${storageRecoveryFile}\n`
      )
      process.exitCode = 1
    }
  }
}

if (scenarioPassed && !process.exitCode) {
  const scenarioSummary = restoreStorageRecoveryOnly
    ? 'verified persistent storage recovery'
    : runAccessibilityOnly
    ? 'shared first-use onboarding, completion persistence, high contrast, extra-large type, two-column grid, reconstruction, replay and second completion'
    : runBoardManagementOnly
    ? 'personal-board creation, rename, ordering, CBoard folder navigation, link removal, safe deletion, persistence reconstruction'
    : runPersonalCardCopyOnly
    ? 'caregiver personal-card copy, distinct Tile identity, shared media, source deletion safety, persistence reconstruction'
    : runAdultCareDefaultsOnly
    ? 'adult-care home actions, shared core-word and repair boards, safe negation matching, isolated receiver display, and ARASAAC attribution'
    : runSessionOnly
    ? 'scene selection, scene reconstruction, confirmation cancellation, new-conversation context reset, history preservation, and empty patient workspace reconstruction'
    : runFeedbackOnly
      ? 'candidate feedback draft creation, replacement, cancellation, confirmation, history review, and reconstruction'
      : runBoardVisibilityOnly
        ? 'caregiver board hiding, patient navigation filtering, reconstruction, exact restoration, and second reconstruction'
      : runLibraryPlacementOnly
        ? 'patient workspace isolation, caregiver picture-library routing, curation visibility, and cross-category CBoard search'
      : runOfflineOnly
        ? 'offline caregiver status, patient expression, caregiver reception, isolated display, two-way history, reconstruction, and wx network restoration'
      : runStorageFailureOnly
        ? 'expression storage failure retention, visible retry state, successful in-place confirmation, duplicate prevention'
      : runHistoryReviewOnly
        ? 'arbitrary confirmed receiver history review, immutable source records, append-only revision evidence, projected pictogram replacement, and reconstruction'
      : runOrderingOnly
      ? 'caregiver manual ordering, patient usage counting, popularity ordering, folder stability, reconstruction, and exact manual-order restoration'
      : runOcrOnly
        ? 'caregiver OCR privacy confirmation, authenticated multipart upload, editable one-time text intent, no automatic matching or history side effects, and explicit corrected generation'
      : runAccountSyncOnly
        ? 'OpenSymbols offline cache, account sync'
        : `patient expression, receiver cold resume, receiver feedback review resume, manual insertion, correction memory management, two-way history, private OBL and anonymized OBLA exports, device-private missing-token images, personal images with a private ZIP round-trip, AAC import package navigation, OBF, OBZ media, AsTeRICS GRD, and Gridset imports${runServerAacScenario ? ', plus authenticated Snap and TouchChat conversion' : ''}`
  step(
    `PASS: ${scenarioSummary}, and storage restoration`
  )
}
