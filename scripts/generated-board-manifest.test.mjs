import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { encodeCboardDefaultRuntimeBoards } from './cboard-default-runtime-format.mjs'

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptsRoot, '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cboard-manifest-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const mini = path.join(root, 'mini')
  const web = path.join(root, 'cboard')
  const assets = path.join(mini, 'src/assets/cboard-default')
  const generated = path.join(mini, 'src/generated')
  for (const directory of ['scripts', 'src/generated', 'src/assets/cboard-default']) {
    mkdirSync(path.join(mini, directory), { recursive: true })
  }
  for (const directory of ['src/api', 'src/translations', 'public']) {
    mkdirSync(path.join(web, directory), { recursive: true })
  }
  for (const file of ['generate-cboard-default-boards.mjs', 'cboard-default-runtime-format.mjs', 'generated-png-integrity.mjs']) {
    copyFileSync(path.join(scriptsRoot, file), path.join(mini, 'scripts', file))
  }
  const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value) + '\n')
  writeJson(path.join(mini, 'scripts/cboard-retained-images.json'), [])
  const source = { advanced: [{ id: 'synthetic-board', nameKey: 'board.example', tiles: [
    { id: 'synthetic-tile', labelKey: 'tile.example', image: '/fixture.png' }
  ] }] }
  const translations = { 'board.example': 'Synthetic board', 'tile.example': 'Synthetic tile', 'web.only': 'New web label' }
  const translationsPath = path.join(web, 'src/translations/zh-CN.json')
  writeJson(path.join(web, 'src/api/boards.json'), source)
  writeJson(translationsPath, translations)
  writeJson(path.join(web, 'src/translations/zh-CN.aac-review.json'), {})
  // Reuse a public bundled PNG only; no private image or image converter runs.
  const png = readFileSync(path.join(projectRoot, 'src/assets/cboard-default/28826a9cc4878ed5.png'))
  writeFileSync(path.join(web, 'public/fixture.png'), png)
  const imageName = sha256(['fixture.png', sha256(png), 'png8-white-v1'].join('\0')).slice(0, 16) + '.png'
  writeFileSync(path.join(assets, imageName), png)
  const boards = [{ ...source.advanced[0], name: translations['board.example'], tiles: [{
    ...source.advanced[0].tiles[0], label: translations['tile.example'],
    vocalization: translations['tile.example'], image: '/assets/cboard-default/' + imageName,
    backgroundColor: '', loadBoard: ''
  }] }]
  const boardsPath = path.join(generated, 'cboardDefaultBoards.json')
  const runtimePath = path.join(generated, 'cboardDefaultBoards.runtime.json')
  const manifestPath = path.join(generated, 'cboardDefaultBoards.manifest.json')
  writeJson(boardsPath, boards)
  writeJson(runtimePath, encodeCboardDefaultRuntimeBoards(boards))
  writeJson(manifestPath, {
    version: 1, source: 'cboard/src/api/boards.json#advanced + zh-CN.json + zh-CN.aac-review.json',
    boardsSha256: 'old', translationsSha256: 'old', reviewedTranslationsSha256: 'old',
    boardCount: 1, tileCount: 1, imageCount: 1, retainedImages: [], imageSize: 96,
    imageFormat: 'png', imageColors: 32, imageBackground: 'white', imageVariant: 'png8-white-v1'
  })
  return { mini, web, assets, generated, translationsPath, translations, boardsPath, runtimePath, manifestPath, imageName, writeJson }
}

function snapshot(f) {
  return Object.fromEntries([f.generated, f.assets].flatMap(directory =>
    readdirSync(directory).map(name => [path.join(directory, name), sha256(readFileSync(path.join(directory, name)))])
  ))
}

function run(f) {
  return spawnSync(process.execPath, [path.join(f.mini, 'scripts/generate-cboard-default-boards.mjs'), '--manifest-only'], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, MAGICK_PATH: path.join(f.mini, 'must-not-run-magick') }
  })
}

test('refreshes fingerprints for unrelated translations while preserving both JSON files and PNG bytes', t => {
  const f = fixture(t)
  const before = snapshot(f)
  const result = run(f)
  assert.equal(result.status, 0, result.stderr)
  const after = snapshot(f)
  const changed = Object.keys(before).filter(file => before[file] !== after[file])
  assert.deepEqual(changed, [f.manifestPath])
  const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'))
  assert.equal(manifest.translationsSha256, sha256(readFileSync(f.translationsPath)))
  assert.equal(manifest.boardsSha256, sha256(readFileSync(path.join(f.web, 'src/api/boards.json'))))
  assert.equal(manifest.reviewedTranslationsSha256, sha256(readFileSync(path.join(f.web, 'src/translations/zh-CN.aac-review.json'))))
})

const rejectedChanges = {
  'used board name': f => f.writeJson(f.translationsPath, { ...f.translations, 'board.example': 'Changed board' }),
  'used tile label and vocalization': f => f.writeJson(f.translationsPath, { ...f.translations, 'tile.example': 'Changed tile' }),
  'runtime JSON': f => f.writeJson(f.runtimePath, {}),
  'source image bytes': f => writeFileSync(path.join(f.web, 'public/fixture.png'), 'changed-source'),
  'missing bundled image': f => rmSync(path.join(f.assets, f.imageName)),
  'corrupt bundled image': f => writeFileSync(path.join(f.assets, f.imageName), Buffer.alloc(300)),
  'unexpected bundled image': f => writeFileSync(path.join(f.assets, 'unexpected.png'), Buffer.alloc(300)),
  'package metadata': f => {
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'))
    f.writeJson(f.manifestPath, { ...manifest, imageColors: 16 })
  }
}

for (const [name, mutate] of Object.entries(rejectedChanges)) {
  test('refuses ' + name + ' without modifying any generated file', t => {
    const f = fixture(t)
    mutate(f)
    const before = snapshot(f)
    const result = run(f)
    assert.notEqual(result.status, 0)
    assert.deepEqual(snapshot(f), before)
  })
}
