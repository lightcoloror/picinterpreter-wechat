import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const boardsPath = path.join(
  projectRoot,
  'src/generated/cboardDefaultBoards.json'
)
const reviewPath = path.join(
  projectRoot,
  'compliance/symbol-release-review.json'
)
const inventoryPath = path.join(
  projectRoot,
  'compliance/symbol-license-inventory.json'
)

const sourceBoardsPath = path.resolve(projectRoot, '../cboard/src/api/boards.json')
const sourceBoards = JSON.parse(readFileSync(sourceBoardsPath, 'utf8')).advanced
const sourceImages = new Map(Object.values(sourceBoards).flatMap(board =>
  Object.values(board.tiles).map(tile => [`${board.id}:${tile.id}`, tile.image])
))
function resolveProvider(boardId, tile) {
  const image = sourceImages.get(`${boardId}:${tile.id}`) || ''
  const provider = /^\/symbols\/([^/]+)\//.exec(image)?.[1] || 'unknown'
  const declared = String(tile.pictogramProvider || '').trim().toLowerCase()
  return declared && declared !== provider ? 'source-mismatch' : provider
}

function buildInventory(boards) {
  return boards.flatMap(board =>
    board.tiles.map(tile => ({
      boardId: board.id,
      boardName: board.name,
      tileId: tile.id,
      label: tile.label,
      labelKey: tile.labelKey || '',
      provider: resolveProvider(board.id, tile),
      sourceImage: sourceImages.get(`${board.id}:${tile.id}`) || null,
      originalId: tile.pictogramOriginalId || '',
      image: tile.image
    }))
  )
}

function countByProvider(inventory) {
  return inventory.reduce((counts, item) => {
    counts[item.provider] = (counts[item.provider] || 0) + 1
    return counts
  }, {})
}

if (!existsSync(boardsPath) || !existsSync(reviewPath)) {
  throw new Error('Generated boards or symbol release review is missing.')
}

const boards = JSON.parse(readFileSync(boardsPath, 'utf8'))
const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
const inventory = buildInventory(boards)
const counts = countByProvider(inventory)
const errors = []

for (const provider of Object.keys(counts)) {
  if (!Object.prototype.hasOwnProperty.call(review.providers, provider)) {
    errors.push(`${provider} has no release review; add licensing evidence before approval.`)
  }
}

for (const [provider, decision] of Object.entries(review.providers)) {
  if (counts[provider] !== decision.expectedTileCount) {
    errors.push(
      `${provider} expected ${decision.expectedTileCount} tiles, found ${counts[provider] || 0}.`
    )
  }
}

const formalRelease = process.argv.includes('--formal-release')
if (formalRelease) {
  for (const [provider, decision] of Object.entries(review.providers)) {
    if ((counts[provider] || 0) > 0 && decision.status !== 'approved') {
      errors.push(
        `${provider} is ${decision.status}; formal release requires approved licensing or replacement.`
      )
    }
  }
}

if (process.argv.includes('--write-inventory')) {
  writeFileSync(
    inventoryPath,
    JSON.stringify(
      {
        version: 1,
        generatedFrom: 'src/generated/cboardDefaultBoards.json',
        intent: '逐图卡定位正式发布前必须取得许可或替换的内置图符。',
        decision:
          'Mulberry 可在履行署名和同方式共享后使用；ARASAAC 与 CBoard 待处理项在批准前阻断正式发布。',
        reason: '公司主体发布可能构成商业使用，不能把非商业或不明确许可当作已批准。',
        evidence: counts,
        effectiveScope: '微信小程序随包的 46 个默认板和 871 个图卡。',
        items: inventory
      },
      null,
      2
    ) + '\n'
  )
}

if (errors.length) {
  console.error('Symbol license validation failed:')
  errors.forEach(error => console.error(`- ${error}`))
  process.exitCode = 1
} else {
  console.log(
    `Symbol license inventory is consistent: ${JSON.stringify(counts)}.`
  )
}
