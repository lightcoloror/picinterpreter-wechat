import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeCboardDefaultRuntimeBoards } from './cboard-default-runtime-format.mjs'

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
const generatedRoot = path.join(projectRoot, 'src/generated')
const assetsRoot = path.join(projectRoot, 'src/assets/cboard-default')
const boardsOutputPath = path.join(generatedRoot, 'cboardDefaultBoards.json')
const runtimeBoardsOutputPath = path.join(
  generatedRoot,
  'cboardDefaultBoards.runtime.json'
)
const manifestOutputPath = path.join(
  generatedRoot,
  'cboardDefaultBoards.manifest.json'
)
const IMAGE_SIZE = 96
const IMAGE_FORMAT = 'png'
const IMAGE_COLORS = 32
const IMAGE_BACKGROUND = 'white'
const IMAGE_VARIANT = 'png8-white-v1'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function resolveMagick() {
  const candidates = [
    process.env.MAGICK_PATH,
    'magick',
    'D:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe'
  ].filter(Boolean)

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-version'], {
      encoding: 'utf8',
      windowsHide: true
    })
    if (result.status === 0) {
      return candidate
    }
  }

  throw new Error(
    'ImageMagick was not found. Install it or set MAGICK_PATH before generating CBoard assets.'
  )
}

function resolveSourceImage(imagePath) {
  const normalized = String(imagePath || '').replace(/^[/\\]+/, '')
  const absolutePath = path.join(cboardRoot, 'public', normalized)

  if (existsSync(absolutePath)) {
    return { absolutePath, normalized }
  }

  if (!path.extname(absolutePath) && existsSync(absolutePath + '.png')) {
    return {
      absolutePath: absolutePath + '.png',
      normalized: normalized + '.png'
    }
  }

  throw new Error('Missing CBoard image: ' + imagePath)
}

function convertImage(magick, sourcePath, outputPath) {
  const result = spawnSync(
    magick,
    [
      sourcePath,
      '-background',
      IMAGE_BACKGROUND,
      '-resize',
      IMAGE_SIZE + 'x' + IMAGE_SIZE,
      '-alpha',
      'remove',
      '-alpha',
      'off',
      '-strip',
      '-dither',
      'None',
      '-colors',
      String(IMAGE_COLORS),
      '-define',
      'png:compression-level=9',
      'PNG8:' + outputPath
    ],
    {
      encoding: 'utf8',
      windowsHide: true
    }
  )

  if (result.status !== 0) {
    throw new Error(
      'Image conversion failed for ' +
        sourcePath +
        ': ' +
        String(result.stderr || result.stdout || 'unknown ImageMagick error')
    )
  }
}

const boardsSource = readFileSync(boardsPath, 'utf8')
const translationsSource = readFileSync(translationsPath, 'utf8')
const reviewedTranslationsSource = readFileSync(
  reviewedTranslationsPath,
  'utf8'
)
const boardCollection = JSON.parse(boardsSource)
const translations = {
  ...JSON.parse(translationsSource),
  ...JSON.parse(reviewedTranslationsSource)
}
const sourceBoards = Array.isArray(boardCollection.advanced)
  ? boardCollection.advanced
  : []

if (!sourceBoards.length) {
  throw new Error('CBoard advanced default boards are empty.')
}

if (!assetsRoot.startsWith(projectRoot) || !generatedRoot.startsWith(projectRoot)) {
  throw new Error('Generated output escaped the WeChat project root.')
}

const magick = resolveMagick()
rmSync(assetsRoot, { recursive: true, force: true })
mkdirSync(assetsRoot, { recursive: true })
mkdirSync(generatedRoot, { recursive: true })

const convertedImages = new Map()
const generatedBoards = sourceBoards.map(board => ({
  ...board,
  name: translations[board.nameKey] || board.name || board.id,
  nameKey: board.nameKey || '',
  tiles: (board.tiles || []).map(tile => {
    const sourceImage = resolveSourceImage(tile.image)
    let outputName = convertedImages.get(sourceImage.normalized)

    if (!outputName) {
      const imageFingerprint = [
        sourceImage.normalized,
        sha256(readFileSync(sourceImage.absolutePath)),
        IMAGE_VARIANT
      ].join('\0')
      outputName =
        sha256(imageFingerprint).slice(0, 16) + '.' + IMAGE_FORMAT
      convertImage(
        magick,
        sourceImage.absolutePath,
        path.join(assetsRoot, outputName)
      )
      convertedImages.set(sourceImage.normalized, outputName)
    }

    return {
      ...tile,
      label: translations[tile.labelKey] || tile.label || tile.labelKey,
      labelKey: tile.labelKey || '',
      vocalization:
        translations[tile.vocalizationKey] ||
        tile.vocalization ||
        translations[tile.labelKey] ||
        tile.label ||
        tile.labelKey,
      image: '/assets/cboard-default/' + outputName,
      backgroundColor: tile.backgroundColor || '',
      loadBoard: tile.loadBoard || ''
    }
  })
}))

const manifest = {
  version: 1,
  source:
    'cboard/src/api/boards.json#advanced + zh-CN.json + zh-CN.aac-review.json',
  boardsSha256: sha256(boardsSource),
  translationsSha256: sha256(translationsSource),
  reviewedTranslationsSha256: sha256(reviewedTranslationsSource),
  boardCount: generatedBoards.length,
  tileCount: generatedBoards.reduce(
    (count, board) => count + board.tiles.length,
    0
  ),
  imageCount: convertedImages.size,
  imageSize: IMAGE_SIZE,
  imageFormat: IMAGE_FORMAT,
  imageColors: IMAGE_COLORS,
  imageBackground: IMAGE_BACKGROUND,
  imageVariant: IMAGE_VARIANT
}

writeFileSync(boardsOutputPath, JSON.stringify(generatedBoards) + '\n')
writeFileSync(
  runtimeBoardsOutputPath,
  JSON.stringify(encodeCboardDefaultRuntimeBoards(generatedBoards)) + '\n'
)
writeFileSync(manifestOutputPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(
  'Generated ' +
    manifest.boardCount +
    ' boards, ' +
    manifest.tileCount +
    ' tiles and ' +
    manifest.imageCount +
    ' compressed images.'
)
