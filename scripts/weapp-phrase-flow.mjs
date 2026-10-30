// Reuses the official IDE calls and selectors from the readability checks.
// Existing synthetic data only: this runner never seeds or restores storage.
/* global wx */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const project = process.argv[2] && path.resolve(process.argv[2])
const evidence = process.argv[3] && path.resolve(process.argv[3])
const cli = process.env.WECHATIDE_SKILL_CLI
assert.ok(project && evidence && cli,
  'Usage: WECHATIDE_SKILL_CLI=... node scripts/weapp-phrase-flow.mjs <isolated-project> <evidence-directory> --isolated-fixture')
assert.ok(process.argv.includes('--isolated-fixture'), 'Confirm this is an isolated synthetic fixture project')
assert.notEqual(project, path.resolve(directory, '..'), 'Do not run against the development project')
const config = JSON.parse(readFileSync(path.join(project, 'project.config.json'), 'utf8'))
assert.match(config.projectname, /readability|e2e|test/i, 'Use an explicitly named test project')
const fixtures = JSON.parse(readFileSync(path.join(directory, 'fixtures/phrase-flow.json'), 'utf8'))
mkdirSync(evidence, { recursive: true })
const temporary = mkdtempSync(path.join(tmpdir(), 'phrase-flow-'))
const report = { status: 'running', startedAt: new Date().toISOString(), cases: [], checks: [],
  limits: ['Existing synthetic fixtures only; no storage seeding.',
    'Sequential open/close cycles, not timed concurrent taps.',
    'Silent-view speech invocation is checked separately by callback tests; no audio spy is installed.',
    'Developer-tool simulation, not physical-device acceptance.'] }
const patient = 'packages/caregiver/pages/patient/index'
const manager = 'packages/management/pages/index/index'
let stage = 'preflight'
let before

function call(tool, options = {}) {
  const args = ['-c', process.env.WECHATIDE_CLIENT_NAME || 'Codex', tool, '--project', project]
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'object') {
      const file = path.join(temporary, `${key}.json`)
      writeFileSync(file, JSON.stringify(value))
      args.push(`--${key}-file`, file)
    } else args.push(`--${key}`, String(value))
  }
  // Pass source/Chinese paths as arguments, not shell command text. This is the
  // same Electron bootstrap used by the installed official Windows wrapper.
  const base = path.dirname(cli)
  const executable = path.join(base, '微信开发者工具.exe')
  const entry = path.join(base, 'resources/app.asar.unpacked/js/common/cli/skill-index.js')
  let command = cli, commandArgs = args, env = process.env
  if (process.platform === 'win32') {
    assert.ok(existsSync(executable) && existsSync(entry), 'Official Windows IDE entry not found beside WECHATIDE_SKILL_CLI')
    command = executable
    commandArgs = ['-e', 'const e=process.argv[1],a=process.argv.slice(2);process.argv=[process.execPath,e,"--electron"].concat(a);require(e)', entry, ...args]
    env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }
  const result = spawnSync(command, commandArgs, { env, cwd: base, encoding: 'utf8', windowsHide: true, timeout: 45_000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${tool}: ${result.stdout}\n${result.stderr}`)
  const text = result.stdout
  const response = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  assert.equal(response.ok, true, `${tool}: ${JSON.stringify(response)}`)
  assert.notEqual(response.result?.success, false, `${tool}: ${JSON.stringify(response)}`)
  return response.result
}
const evaluate = (fn, args = []) => call('automation_evaluate', { 'fn-source': fn.toString(), args }).result.result
const element = (selector, action, options = {}) => call('automation_element_action', { selector, action, ...options })
const query = selector => call('automation_page_action', { action: 'querySelectorAll', selector }).elements
const screenshot = name => call('simulator_screenshot', { path: path.join(evidence, `${name}.jpg`) })
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function button(parent, label) {
  const xml = element(parent, 'outerWxml')
  const matches = [...xml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(match => match[2] === label)
  assert.equal(matches.length, 1, `One ${label} button in ${parent}`)
  return `#${matches[0][1].match(/\bid="([^"]+)"/)[1]}`
}
function selected(parent, label) {
  assert.match(element(button(parent, label), 'attribute', { name: 'class' }), /button--primary/,
    `${label} remains selected in ${parent}`)
}
function rows() {
  return [...element('.phrase-manager__list', 'outerWxml').matchAll(/<view\b[^>]*id="saved-phrase-([^"]+)"/g)].map(match => match[1])
}
function ready(route, selector) {
  // Reacquire the current page after navigation; old-page waits can report
  // "not on top of page stack" and must not be mistaken for a product failure.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (call('automation_runtime_info', { action: 'currentPage' }).currentPage.path === route && query(selector).length) return
  }
  throw new Error(`Page did not become ready: ${route} ${selector}`)
}
function snapshot() {
  return evaluate(function () {
    var fs = wx.getFileSystemManager(), root = wx.env.USER_DATA_PATH, files = {}, storage = {}
    fs.readdirSync(root).filter(function (name) { return /^picinterpreter-(favorite|expression)-local-[a-f0-9]+\.json$/.test(name) }).sort().forEach(function (name) {
      files[name] = fs.readFileSync(root + '/' + name, 'utf8')
    })
    wx.getStorageInfoSync().keys.filter(function (key) { return /saved_phrase|favorite|expression|draft/.test(key) }).sort().forEach(function (key) {
      storage[key] = wx.getStorageSync(key)
    })
    return { files: files, storage: storage }
  })
}
function search(value) {
  if (value) element('.phrase-manager__search', 'input', { value })
  else element('.phrase-manager__search', 'trigger', { type: 'input', detail: { value: '' } })
  assert.equal(element('.phrase-manager__search', 'value'), value)
}
function viewAndReturn(item, term, label, capture = false) {
  stage = `search-view-return:${label}/${item.id}`
  console.log(`[phrase-flow] ${stage}`)
  search(term)
  assert.deepEqual(rows(), [item.id], `Exact search result: ${label} / ${term}`)
  selected('.phrase-manager', label)
  const viewButton = button(`#saved-phrase-${item.id}`, '查看整句')
  evaluate(function (selector) { return new Promise(function (resolve, reject) { wx.pageScrollTo({ selector: selector, duration: 0, success: resolve, fail: reject }) }) }, [viewButton])
  const beforeOffset = element(viewButton, 'offset')
  const beforeSize = element(viewButton, 'size')
  assert.ok(beforeOffset.top >= 0 && beforeOffset.top + beforeSize.height <= report.viewport.height + 1, 'View action is reachable after scrolling')
  element(viewButton, 'tap')
  assert.equal(query('#phrase-playback-overlay').length, 1)
  assert.equal(element('.phrase-playback-overlay__sentence', 'text'), item.sentence)
  assert.equal(query('.phrase-playback-overlay__figure').length, item.output.length)
  if (capture) {
    element('.phrase-playback-overlay__scroll', 'scrollTo', { x: 0, y: 10000 })
    const offset = element('#phrase-playback-close', 'offset'), size = element('#phrase-playback-close', 'size')
    assert.ok(size.width >= 44 && size.height >= 44, 'Return target is at least 44px')
    assert.ok(offset.top >= 0 && offset.top + size.height <= report.viewport.height + 1, 'Return target is reachable after scrolling')
    screenshot(`view-${item.id}`)
  }
  element('#phrase-playback-close', 'tap')
  assert.equal(query('#phrase-playback-overlay').length, 0, 'No stale overlay')
  assert.equal(element('.phrase-manager__search', 'value'), term)
  assert.deepEqual(rows(), [item.id], 'Closing preserves the filtered result')
  selected('.phrase-manager', label)
  const afterOffset = element(viewButton, 'offset')
  assert.ok(Math.abs(afterOffset.top - beforeOffset.top) <= 1, 'Closing preserves the list scroll position')
  report.checks.push({ item: item.id, context: label, query: term, completeSentence: true,
    figures: item.output.length, returnedQueryAndContextPreserved: true, listScrollPreserved: true })
}

try {
  const status = call('check_wechatide_status', { 'skill-version': '0.3.11' })
  assert.equal(status.loginExpired, false)
  assert.ok(['equal', 'agent_ahead'].includes(status.versionRelation))
  const system = call('automation_runtime_info', { action: 'systemInfo' }).systemInfo.result
  report.viewport = { width: system.windowWidth, height: system.windowHeight, model: system.model }
  if (process.env.WEAPP_E2E_EXPECT_WIDTH) assert.equal(system.windowWidth, Number(process.env.WEAPP_E2E_EXPECT_WIDTH))
  before = snapshot()
  assert.ok(Object.keys(before.files).some(name => name.includes('favorite')), 'Fixture favorite file must exist; no vacuous storage comparison')
  report.storageBeforeHash = hash(before)
  stage = 'open-patient'
  evaluate(function (url) { return new Promise(function (resolve, reject) { wx.reLaunch({ url: url, success: resolve, fail: reject }) }) }, ['/' + patient])
  ready(patient, '.saved-phrases-panel')
  report.pageClass = element('.communication-page', 'attribute', { name: 'class' })
  const topOutput = element('.expression-strip', 'text')
  report.topOutputWasEmpty = topOutput.includes('还没有选择图片')
  assert.equal(query('.saved-phrase-card').length, 6)
  assert.equal(element('#saved-phrases-view-all', 'text'), `查看全部（${fixtures.length}）`)
  element('#saved-phrases-view-all', 'tap')
  ready(manager, '.phrase-manager__list')
  assert.deepEqual(rows(), fixtures.map(item => item.id), 'All eight fixtures including seventh/eighth are reachable')
  for (const item of fixtures) assert.equal(element(`#saved-phrase-${item.id} .phrase-manager__sentence`, 'text'), item.sentence)
  evaluate(function () { return new Promise(function (resolve, reject) { wx.navigateBack({ success: resolve, fail: reject }) }) })
  ready(patient, '.saved-phrases-panel')
  for (const scenario of [
    { context: '外出', target: 'readability-7', term: '外套' },
    { context: '日常交流', target: 'readability-8', term: '午饭' }
  ]) {
    stage = `select-context:${scenario.context}`
    console.log(`[phrase-flow] ${stage}`)
    element(button('.saved-phrases-panel', scenario.context), 'tap')
    selected('.saved-phrases-panel', scenario.context)
    const expected = fixtures.filter(item => item.lifeContext === scenario.context)
    assert.equal(query('.saved-phrase-card').length, expected.length)
    assert.equal(element('#saved-phrases-view-all', 'text'), `查看全部（${expected.length}）`)
    const outputBefore = element('.expression-strip', 'text')
    element('#saved-phrases-view-all', 'tap')
    ready(manager, '.phrase-manager__list')
    stage = `management-context:${scenario.context}`
    selected('.phrase-manager', scenario.context)
    assert.deepEqual(rows(), expected.map(item => item.id), 'Cross-page context retains exactly the expected entries')
    viewAndReturn(fixtures.find(item => item.id === scenario.target), scenario.term, scenario.context, true)
    if (scenario.context === '日常交流') {
      search('喝水')
      assert.deepEqual(rows(), [], 'Search must not leak matching entries from the other context')
      assert.ok(element('.phrase-manager', 'text').includes('没有找到匹配的常用语'))
      search('')
      assert.deepEqual(rows(), expected.map(item => item.id), 'Clearing search restores this context only')
      // Alternate actual entries without sleeps; this is sequential automation,
      // not a claim about simultaneous/timed tap race conditions.
      for (const [id, term] of [['readability-2', '窗户'], ['readability-8', '午饭'], ['readability-2', '窗户']]) {
        viewAndReturn(fixtures.find(item => item.id === id), term, scenario.context)
      }
      screenshot('returned-filtered-list')
    }
    evaluate(function () { return new Promise(function (resolve, reject) { wx.navigateBack({ success: resolve, fail: reject }) }) })
    ready(patient, '.saved-phrases-panel')
    selected('.saved-phrases-panel', scenario.context)
    assert.equal(element('.expression-strip', 'text'), outputBefore)
    assert.equal(element('.expression-strip', 'text'), topOutput)
    assert.equal(query('#phrase-playback-overlay').length, 0)
    report.cases.push({ context: scenario.context, selectedCount: expected.length, target: scenario.target, status: 'passed' })
  }
  stage = 'storage-invariant'
  assert.deepEqual(snapshot(), before, 'Viewing/navigation must not change favorites, usage or expression/draft storage')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = { stage, message: error.message }
  try { report.failure.page = call('automation_runtime_info', { action: 'currentPage' }).currentPage; screenshot('failure') }
  catch (diagnosticError) { report.failure.diagnosticError = diagnosticError.message }
  process.exitCode = 1
} finally {
  if (before) {
    try {
      const after = snapshot()
      report.storageAfterHash = hash(after)
      report.storageUnchanged = report.storageAfterHash === report.storageBeforeHash
      if (!report.storageUnchanged) { report.status = 'failed'; process.exitCode = 1 }
    } catch (error) { report.storageCheckError = error.message; report.status = 'failed'; process.exitCode = 1 }
  }
  report.finishedAt = new Date().toISOString()
  writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()))
  assert.ok(path.basename(temporary).startsWith('phrase-flow-'))
  rmSync(temporary, { recursive: true, force: true })
  console.log(JSON.stringify(report, null, 2))
}
