import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cboardCoreRoot = path.resolve(
  projectRoot,
  '../cboard/src/common/communicationSupport'
)

const forbiddenApplicationPatterns = [
  { pattern: /from\s+['"]react-dom/, label: 'React DOM import' },
  { pattern: /@material-ui|@mui\//, label: 'Material UI import' },
  { pattern: /cboard\/src\/components/, label: 'CBoard component import' },
  {
    pattern: /\b(?:appSecret|secretId|secretKey)\b/i,
    label: 'server credential marker in client source'
  }
]

const forbiddenCorePatterns = [
  { pattern: /from\s+['"]react(?:['"/])/, label: 'React import in pure core' },
  { pattern: /@material-ui|@mui\//, label: 'Material UI import in pure core' },
  { pattern: /\.\.\/\.\.\/helpers/, label: 'Web helper import in pure core' },
  {
    pattern:
      /(?:from\s+['"][^'"]*src\/api\/boards\.json|require\s*\(\s*['"][^'"]*src\/api\/boards\.json)/,
    label: 'Web default board import in pure core'
  },
  { pattern: /\b(?:window|document|localStorage)\b/, label: 'browser global in pure core' },
  { pattern: /\bwx\s*\./, label: 'global wx access in pure core' }
]

const consumedCoreFiles = [
  'boardManagement.js',
  'dto.js',
  'expressionPipeline.js',
  'legacy.js',
  'missingTokens.js',
  'phraseSuggestions.js',
  'conversationSession.js',
  'repository.js',
  'storage.js',
  'tileMetadata.js',
  'receiverContract.js',
  'receiverPipeline.js',
  'receiverLifecycle.js',
  'receiverPatientFeedback.js',
  'runtimePictogram.js',
  'symbolMatching.js',
  'segmentation.js',
  'chineseLexicon.js',
  'cboardConceptProfiles.js',
  'networkStatus.js',
  'pictogramAttribution.js',
  'pictogramMetadataSuggestion.js',
  'publicBoardLibrary.js',
  'communicationOnboarding.js',
  'candidateFeedback.js',
  'expressionPictogramSearch.js',
  'pictogramSuggestions.js',
  'openBoardFormat.js',
  'privateArchiveEncryption.js',
  'privateArchivePassphrase.js',
  'resolvers.js',
  'adapters/wechatStorage.js'
]

function collectSourceFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const absolutePath = path.join(directory, name)
    if (statSync(absolutePath).isDirectory()) {
      return collectSourceFiles(absolutePath)
    }

    return /\.(?:ts|tsx|js|mjs)$/.test(name) ? [absolutePath] : []
  })
}

function checkFiles(files, patterns) {
  const violations = []

  files.forEach(file => {
    const content = readFileSync(file, 'utf8')
    patterns.forEach(({ pattern, label }) => {
      if (pattern.test(content)) {
        violations.push(`${label}: ${path.relative(projectRoot, file)}`)
      }
    })
  })

  return violations
}

const applicationFiles = collectSourceFiles(path.join(projectRoot, 'src'))
const coreFiles = consumedCoreFiles.map(file => path.join(cboardCoreRoot, file))
const violations = [
  ...checkFiles(applicationFiles, forbiddenApplicationPatterns),
  ...checkFiles(coreFiles, forbiddenCorePatterns)
]

if (violations.length) {
  console.error('Cross-platform boundary check failed:')
  violations.forEach(violation => console.error(`- ${violation}`))
  process.exitCode = 1
} else {
  console.log(
    `Boundary check passed: ${applicationFiles.length} app files and ${coreFiles.length} CBoard core files.`
  )
}
