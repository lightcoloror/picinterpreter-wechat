import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decodeCboardDefaultRuntimeBoards,
  projectCboardDefaultRuntimeBoards
} from './cboard-default-runtime-format.mjs'
import { inspectGeneratedPng } from './generated-png-integrity.mjs'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const cboardRoot = path.resolve(projectRoot, '../cboard')
const boardsPath = path.join(cboardRoot, 'src/api/boards.json')
const translationsPath = path.join(cboardRoot, 'src/translations/zh-CN.json')
const reviewedTranslationsPath = path.join(
  cboardRoot,
  'src/translations/zh-CN.aac-review.json'
)
const generatedBoardsPath = path.join(
  projectRoot,
  'src/generated/cboardDefaultBoards.json'
)
const runtimeBoardsPath = path.join(
  projectRoot,
  'src/generated/cboardDefaultBoards.runtime.json'
)
const manifestPath = path.join(
  projectRoot,
  'src/generated/cboardDefaultBoards.manifest.json'
)
const assetsRoot = path.join(projectRoot, 'src/assets/cboard-default')
const EXPECTED_IMAGE_SIZE = 96
const EXPECTED_IMAGE_FORMAT = 'png'
const EXPECTED_IMAGE_COLORS = 32
const EXPECTED_IMAGE_BACKGROUND = 'white'
const EXPECTED_IMAGE_VARIANT = 'png8-white-v1'
const MIN_IMAGE_BYTES = 200

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fail(message) {
  console.error(message)
  console.error('Run: npm run generate:boards')
  process.exit(1)
}

if (
  !existsSync(generatedBoardsPath) ||
  !existsSync(runtimeBoardsPath) ||
  !existsSync(manifestPath)
) {
  fail('Generated CBoard board data is missing.')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const boardsSource = readFileSync(boardsPath, 'utf8')
const translationsSource = readFileSync(translationsPath, 'utf8')
const reviewedTranslationsSource = readFileSync(
  reviewedTranslationsPath,
  'utf8'
)
if (
  manifest.imageSize !== EXPECTED_IMAGE_SIZE ||
  manifest.imageFormat !== EXPECTED_IMAGE_FORMAT ||
  manifest.imageColors !== EXPECTED_IMAGE_COLORS ||
  manifest.imageBackground !== EXPECTED_IMAGE_BACKGROUND ||
  manifest.imageVariant !== EXPECTED_IMAGE_VARIANT
) {
  fail('Generated CBoard image format is stale or incompatible.')
}


if (
  manifest.boardsSha256 !== sha256(boardsSource) ||
  manifest.translationsSha256 !== sha256(translationsSource) ||
  manifest.reviewedTranslationsSha256 !== sha256(reviewedTranslationsSource)
) {
  fail('Generated CBoard board data is stale.')
}

const boards = JSON.parse(readFileSync(generatedBoardsPath, 'utf8'))
const runtimeBoards = decodeCboardDefaultRuntimeBoards(
  JSON.parse(readFileSync(runtimeBoardsPath, 'utf8'))
)
try {
  assert.deepEqual(runtimeBoards, projectCboardDefaultRuntimeBoards(boards))
} catch {
  fail('Generated CBoard runtime data is stale or incomplete.')
}
const tiles = boards.flatMap(board => board.tiles || [])
const imagePrefix = '/assets/cboard-default/'
const generatedImageNamePattern = /^[0-9a-f]{16}\.png$/
const incompatibleImages = []
const referencedImageNames = new Set()

for (const tile of tiles) {
  const publicImagePath = String(tile.image || '')
  const imageName = publicImagePath.startsWith(imagePrefix)
    ? publicImagePath.slice(imagePrefix.length)
    : ''

  if (!generatedImageNamePattern.test(imageName)) {
    incompatibleImages.push(publicImagePath || '(empty image path)')
    continue
  }
  referencedImageNames.add(imageName)
}

const assetEntries = existsSync(assetsRoot)
  ? readdirSync(assetsRoot, { withFileTypes: true })
  : []
const packagedImageNames = new Set(
  assetEntries.filter(entry => entry.isFile()).map(entry => entry.name)
)
const unexpectedAssets = assetEntries
  .filter(
    entry =>
      !entry.isFile() || !generatedImageNamePattern.test(entry.name)
  )
  .map(entry => entry.name)
const missingImages = [...referencedImageNames].filter(
  imageName => !packagedImageNames.has(imageName)
)
const orphanImages = [...packagedImageNames].filter(
  imageName => !referencedImageNames.has(imageName)
)
const undersizedImages = [...referencedImageNames].filter(imageName => {
  const imagePath = path.join(assetsRoot, imageName)
  return existsSync(imagePath) && statSync(imagePath).size < MIN_IMAGE_BYTES
})
const corruptImages = []

for (const imageName of referencedImageNames) {
  const imagePath = path.join(assetsRoot, imageName)
  if (!existsSync(imagePath)) {
    continue
  }
  try {
    inspectGeneratedPng(readFileSync(imagePath), {
      expectedMaxSize: manifest.imageSize,
      expectedPaletteColors: manifest.imageColors
    })
  } catch (error) {
    corruptImages.push(imageName + ': ' + error.message)
  }
}

if (
  boards.length !== manifest.boardCount ||
  tiles.length !== manifest.tileCount ||
  referencedImageNames.size !== manifest.imageCount ||
  missingImages.length ||
  incompatibleImages.length ||
  undersizedImages.length ||
  corruptImages.length ||
  orphanImages.length ||
  unexpectedAssets.length
) {
  fail(
    'Generated CBoard package is incomplete (' +
      missingImages.length +
      ' images missing, ' +
      incompatibleImages.length +
      ' images incompatible, ' +
      undersizedImages.length +
      ' images suspiciously small, ' +
      corruptImages.length +
      ' images corrupt, ' +
      orphanImages.length +
      ' orphan images, ' +
      unexpectedAssets.length +
      ' unexpected assets).' +
      (corruptImages[0] ? ' First error: ' + corruptImages[0] : '')
  )
}

console.log(
  'CBoard package ready: ' +
    manifest.boardCount +
    ' boards, ' +
    manifest.tileCount +
    ' tiles, ' +
    manifest.imageCount +
    ' images.'
)
