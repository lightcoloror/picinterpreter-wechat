import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

assert(process.env.TEST_TMP_ROOT, 'Use the managed test runtime')
const fixture = path.join(process.env.TEST_TMP_ROOT, 'symbol-review-fixture')
for (const dir of ['scripts', 'src/generated', 'compliance']) mkdirSync(path.join(fixture, dir), { recursive: true })
const sourceDirectory = path.join(process.env.TEST_TMP_ROOT, 'cboard/src/api')
mkdirSync(sourceDirectory, { recursive: true })
const script = path.join(fixture, 'scripts/check-symbol-licenses.mjs')
writeFileSync(script, readFileSync(fileURLToPath(new URL('./check-symbol-licenses.mjs', import.meta.url))))
const reviewed = { id: 'known', label: 'Synthetic', pictogramProvider: 'mulberry' }
writeFileSync(path.join(fixture, 'compliance/symbol-release-review.json'), JSON.stringify({ providers: { mulberry: { status: 'approved', expectedTileCount: 1 } } }))
function run(tiles, formal = true, sourceTiles = tiles) {
  writeFileSync(path.join(sourceDirectory, 'boards.json'), JSON.stringify({ advanced: [{ id: 'synthetic', tiles: sourceTiles.map(tile => ({ ...tile, image: `/symbols/${tile.pictogramProvider}/source.svg` })) }] }))
  writeFileSync(path.join(fixture, 'src/generated/cboardDefaultBoards.json'), JSON.stringify([{ id: 'synthetic', tiles }]))
  return spawnSync(process.execPath, [script, ...(formal ? ['--formal-release'] : [])], { encoding: 'utf8', windowsHide: true })
}
assert.equal(run([reviewed]).status, 0)
for (const formal of [false, true]) {
  const result = run([reviewed, { id: 'unknown', pictogramProvider: 'unreviewed-source' }], formal)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /unreviewed-source has no release review/)
}
const missing = run([{ ...reviewed, pictogramProvider: undefined }], true, [])
assert.equal(missing.status, 1)
assert.match(missing.stderr, /unknown has no release review/)
const mismatch = run([reviewed], true, [{ ...reviewed, pictogramProvider: 'arasaac' }])
assert.equal(mismatch.status, 1)
assert.match(mismatch.stderr, /source-mismatch has no release review/)
console.log('Reviewed sources pass; unknown, missing provenance and provider mismatch fail closed.')
