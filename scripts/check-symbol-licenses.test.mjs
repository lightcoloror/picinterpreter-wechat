import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

assert(process.env.TEST_TMP_ROOT, 'Use the managed test runtime')
const fixture = path.join(process.env.TEST_TMP_ROOT, 'symbol-review-fixture')
for (const dir of ['scripts', 'src/generated', 'compliance', 'src/assets/emergency']) mkdirSync(path.join(fixture, dir), { recursive: true })
const emergencyPath = path.join(fixture, 'src/assets/emergency/manifest.json')
writeFileSync(emergencyPath, JSON.stringify({ assets: [] }))
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
writeFileSync(emergencyPath, JSON.stringify({ assets: [{ id: 'synthetic-emergency', file: 'missing.png', provider: 'Mulberry Symbols', source: 'synthetic', license: 'synthetic', sha256: '0'.repeat(64) }] }))
const missingEmergency = run([reviewed])
assert.equal(missingEmergency.status, 1)
assert.match(missingEmergency.stderr, /Emergency synthetic-emergency file is missing/)
writeFileSync(path.join(fixture, 'src/assets/emergency/synthetic.png'), 'synthetic image bytes')
writeFileSync(path.join(fixture, 'compliance/symbol-release-review.json'), JSON.stringify({ providers: {
  mulberry: { status: 'approved', expectedTileCount: 1 },
  arasaac: { status: 'pending', expectedTileCount: 0 }
} }))
writeFileSync(emergencyPath, JSON.stringify({ assets: [{ id: 'pending-emergency', file: 'synthetic.png', provider: 'ARASAAC', source: 'synthetic', license: 'synthetic', sha256: createHash('sha256').update('synthetic image bytes').digest('hex') }] }))
assert.equal(run([reviewed], false).status, 0)
const pendingEmergency = run([reviewed], true)
assert.equal(pendingEmergency.status, 1)
assert.match(pendingEmergency.stderr, /Emergency pending-emergency \(arasaac\) is pending/)
console.log('Reviewed sources pass; unknown, missing provenance and provider mismatch fail closed.')
