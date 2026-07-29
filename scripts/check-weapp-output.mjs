import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  findUnusedDeclaredComponents,
  findWxmlDependencySources,
  hasRuntimePluginUsage
} from './weapp-output-quality.mjs'

const outputRoot = path.resolve('dist')
const unsupportedSyntax = [
  { token: '?.', name: 'optional chaining' },
  { token: '??', name: 'nullish coalescing' }
]
const recommendedPackageBytes = 1.5 * 1024 * 1024
const maximumPackageBytes = 2 * 1024 * 1024
const minimumRecommendedHeadroomBytes = 64 * 1024
const maximumMediaBytes = 200 * 1024
const mediaExtensions = new Set([
  '.aac',
  '.gif',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mp3',
  '.ogg',
  '.png',
  '.svg',
  '.wav',
  '.webp'
])

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

async function collectFileInventory(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(async entry => ({
        name: entry.name,
        size: (await stat(path.join(directory, entry.name))).size
      }))
  )
}

const failures = []
const warnings = []
const uploadSettings = [
  {
    name: 'project.config.json',
    config: JSON.parse(await readFile('project.config.json', 'utf8'))
  },
  {
    name: 'dist/project.config.json',
    config: JSON.parse(
      await readFile(path.join(outputRoot, 'project.config.json'), 'utf8')
    )
  }
]
const requiredImageIncludes = [
  {
    type: 'glob',
    value: '**/assets/cboard-default/**'
  },
  {
    type: 'glob',
    value: '**/assets/emergency/**'
  },
  {
    type: 'glob',
    value: '**/sub-common/**'
  }
]

for (const entry of uploadSettings) {
  const setting = entry.config.setting || {}
  for (const key of ['ignoreDevUnusedFiles', 'ignoreUploadUnusedFiles']) {
    if (setting[key] !== true) {
      failures.push(entry.name + ' must set setting.' + key + ' to true')
    }
  }
  for (const key of ['minified', 'minifyWXSS', 'minifyWXML']) {
    if (setting[key] !== true) {
      failures.push(entry.name + ' must set setting.' + key + ' to true')
    }
  }
  const packOptions = entry.config.packOptions || {}
  const includeRules = Array.isArray(packOptions.include)
    ? packOptions.include
    : []
  for (const requiredImageInclude of requiredImageIncludes) {
    const includesGeneratedImages = includeRules.some(
      rule =>
        rule &&
        rule.type === requiredImageInclude.type &&
        rule.value === requiredImageInclude.value
    )
    if (!includesGeneratedImages) {
      failures.push(
        entry.name + ' must include ' + requiredImageInclude.value
      )
    }
  }
}

const appConfig = JSON.parse(
  await readFile(path.join(outputRoot, 'app.json'), 'utf8')
)
if (appConfig.lazyCodeLoading !== 'requiredComponents') {
  failures.push(
    'dist/app.json must set lazyCodeLoading to requiredComponents'
  )
}
if (
  appConfig.permission &&
  Object.prototype.hasOwnProperty.call(
    appConfig.permission,
    'scope.record'
  )
) {
  failures.push(
    'dist/app.json must not declare unsupported permission scope.record'
  )
}

const outputFiles = await collectFiles(outputRoot)
const outputStats = await Promise.all(
  outputFiles.map(async file => ({
    file,
    size: (await stat(file)).size
  }))
)
const subpackageRoots = (appConfig.subPackages || []).map(entry =>
  String(entry.root || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
)
const emergencySubpackageRoot = 'packages/emergency'
if (!subpackageRoots.includes(emergencySubpackageRoot)) {
  failures.push('dist/app.json must declare the emergency subpackage')
}
const managementSubpackageRoot = 'packages/management'
if (!subpackageRoots.includes(managementSubpackageRoot)) {
  failures.push('dist/app.json must declare the management subpackage')
}
const ocrSubpackageRoot = 'packages/ocr'
if (!subpackageRoots.includes(ocrSubpackageRoot)) {
  failures.push('dist/app.json must declare the independent OCR subpackage')
}
const aacImportSubpackageRoot = 'packages/aac-import'
if (!subpackageRoots.includes(aacImportSubpackageRoot)) {
  failures.push(
    'dist/app.json must declare the independent AAC import subpackage'
  )
}

const relativeOutputPaths = outputFiles.map(file =>
  path.relative(outputRoot, file).replace(/\\/g, '/')
)
const outputFileSet = new Set(outputFiles.map(file => path.resolve(file)))

async function collectWxmlDependencyText(
  entryPath,
  visited = new Set()
) {
  const normalizedPath = path.resolve(entryPath)
  if (visited.has(normalizedPath) || !outputFileSet.has(normalizedPath)) {
    return ''
  }

  visited.add(normalizedPath)
  const source = await readFile(normalizedPath, 'utf8')
  const dependencies = await Promise.all(
    findWxmlDependencySources(source).map(async dependency => {
      let dependencyPath = path.resolve(
        path.dirname(normalizedPath),
        dependency
      )
      if (!path.extname(dependencyPath)) {
        dependencyPath += '.wxml'
      }
      return collectWxmlDependencyText(dependencyPath, visited)
    })
  )
  return [source, ...dependencies].join('\n')
}

for (const wxssFile of outputFiles.filter(file => file.endsWith('.wxss'))) {
  const source = await readFile(wxssFile, 'utf8')
  const importPattern = /@import\s+["']([^"']+)["']/g
  let match
  while ((match = importPattern.exec(source))) {
    const importedFile = path.resolve(path.dirname(wxssFile), match[1])
    if (!outputFiles.includes(importedFile)) {
      failures.push(
        path.relative(outputRoot, wxssFile) +
          ' imports missing WXSS file ' +
          match[1]
      )
    }
  }
}
for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  const requiredPath =
    emergencySubpackageRoot + '/pages/index/index.' + extension
  if (!relativeOutputPaths.includes(requiredPath)) {
    failures.push('Emergency output is missing ' + requiredPath)
  }
}
for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  const requiredPath =
    managementSubpackageRoot + '/pages/index/index.' + extension
  if (!relativeOutputPaths.includes(requiredPath)) {
    failures.push('Management output is missing ' + requiredPath)
  }
}
for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  const requiredPath =
    ocrSubpackageRoot + '/pages/capture/index.' + extension
  if (!relativeOutputPaths.includes(requiredPath)) {
    failures.push('OCR output is missing ' + requiredPath)
  }
}
for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  const requiredPath =
    aacImportSubpackageRoot + '/pages/index/index.' + extension
  if (!relativeOutputPaths.includes(requiredPath)) {
    failures.push('AAC import output is missing ' + requiredPath)
  }
}

const managementJavaScript = (
  await Promise.all(
    outputFiles
      .filter(
        file =>
          file.endsWith('.js') &&
          path.relative(outputRoot, file)
            .replace(/\\/g, '/')
            .startsWith(managementSubpackageRoot + '/')
      )
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
for (const requiredToken of [
  '/user/login',
  '/settings',
  '/health',
  '/gpt/communication/health',
  '/gpt/communication/speech',
  'service-readiness-check-button',
  'speech-voice-preview-button'
]) {
  if (!managementJavaScript.includes(requiredToken)) {
    failures.push(
      'Management subpackage is missing runtime capability ' +
        requiredToken
    )
  }
}

const ocrOutputFiles = outputFiles.filter(file =>
  path.relative(outputRoot, file)
    .replace(/\\/g, '/')
    .startsWith(ocrSubpackageRoot + '/')
)
const ocrJavaScript = (
  await Promise.all(
    ocrOutputFiles
      .filter(file => file.endsWith('.js'))
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
for (const requiredToken of [
  '/gpt/communication/ocr',
  'chooseMedia',
  'compressImage',
  'uploadFile'
]) {
  if (!ocrJavaScript.includes(requiredToken)) {
    failures.push(
      'OCR subpackage is missing runtime capability ' + requiredToken
    )
  }
}

const nonOcrJavaScript = (
  await Promise.all(
    outputFiles
      .filter(
        file =>
          file.endsWith('.js') &&
          !path.relative(outputRoot, file)
            .replace(/\\/g, '/')
            .startsWith(ocrSubpackageRoot + '/')
      )
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
if (nonOcrJavaScript.includes('/gpt/communication/ocr')) {
  failures.push(
    'OCR upload implementation must stay outside the main and non-OCR packages'
  )
}

const ocrMediaFiles = ocrOutputFiles.filter(file =>
  mediaExtensions.has(path.extname(file).toLowerCase())
)
if (ocrMediaFiles.length) {
  failures.push('OCR subpackage must not embed static image or audio media')
}

const aacImportOutputFiles = outputFiles.filter(file =>
  path.relative(outputRoot, file)
    .replace(/\\/g, '/')
    .startsWith(aacImportSubpackageRoot + '/')
)
const aacImportJavaScript = (
  await Promise.all(
    aacImportOutputFiles
      .filter(file => file.endsWith('.js'))
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
const aacImportEndpoint = '/communication/aac-import/convert'
if (!aacImportJavaScript.includes(aacImportEndpoint)) {
  failures.push(
    'AAC import subpackage is missing runtime endpoint ' +
      aacImportEndpoint
  )
}
const nonAacImportJavaScript = (
  await Promise.all(
    outputFiles
      .filter(
        file =>
          file.endsWith('.js') &&
          !path.relative(outputRoot, file)
            .replace(/\\/g, '/')
            .startsWith(aacImportSubpackageRoot + '/')
      )
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
if (nonAacImportJavaScript.includes(aacImportEndpoint)) {
  failures.push(
    'AAC conversion implementation must stay outside the main and ' +
      'non-AAC packages'
  )
}
const aacImportMediaFiles = aacImportOutputFiles.filter(file =>
  mediaExtensions.has(path.extname(file).toLowerCase())
)
if (aacImportMediaFiles.length) {
  failures.push(
    'AAC import subpackage must not embed static image or audio media'
  )
}

const backupSubpackageRoot = 'packages/backup'
const backupJavaScript = (
  await Promise.all(
    outputFiles
      .filter(
        file =>
          file.endsWith('.js') &&
          path.relative(outputRoot, file)
            .replace(/\\/g, '/')
            .startsWith(backupSubpackageRoot + '/')
      )
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
const requiredBackupEndpoints = [
  '/gpt/communication/pictogram-metadata',
  '/gpt/communication/background-removal',
  '/board/public',
  'cboard-public-board-bundle',
  '/communication/private-library',
  '/communication/private-library/download',
  '/communication/private-device-data',
  '/communication/private-device-data/download'
]
for (const endpoint of requiredBackupEndpoints) {
  if (!backupJavaScript.includes(endpoint)) {
    failures.push(
      'Backup subpackage is missing runtime endpoint ' + endpoint
    )
  }
}
const nonBackupJavaScript = (
  await Promise.all(
    outputFiles
      .filter(
        file =>
          file.endsWith('.js') &&
          !path.relative(outputRoot, file)
            .replace(/\\/g, '/')
            .startsWith(backupSubpackageRoot + '/')
      )
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
for (const endpoint of requiredBackupEndpoints) {
  if (nonBackupJavaScript.includes(endpoint)) {
    failures.push(
      endpoint +
        ' upload must stay outside the main and non-backup packages'
    )
  }
}
const packageSizes = new Map([
  ['main', 0],
  ...subpackageRoots.map(root => ['/' + root + '/', 0])
])
for (const entry of outputStats) {
  const relativePath = path.relative(outputRoot, entry.file).replace(/\\/g, '/')
  const subpackageRoot = subpackageRoots.find(root =>
    relativePath.startsWith(root + '/')
  )
  const packageName = subpackageRoot ? '/' + subpackageRoot + '/' : 'main'
  packageSizes.set(packageName, (packageSizes.get(packageName) || 0) + entry.size)
}
for (const [packageName, packageBytes] of packageSizes) {
  if (packageBytes > maximumPackageBytes) {
    failures.push(
      packageName + ' exceeds the 2 MiB package limit: ' +
        packageBytes + ' bytes'
    )
  } else if (packageBytes > recommendedPackageBytes) {
    warnings.push(
      packageName + ' exceeds the 1.5 MiB split-package recommendation: ' +
        packageBytes + ' bytes; verify the preview size including plugins'
    )
  } else if (
    recommendedPackageBytes - packageBytes <
    minimumRecommendedHeadroomBytes
  ) {
    warnings.push(
      packageName + ' has only ' +
        (recommendedPackageBytes - packageBytes) +
        ' bytes before the 1.5 MiB split-package recommendation; ' +
        'split low-frequency features before adding more code'
    )
  }
}
const packageSummary = [...packageSizes]
  .map(([name, size]) => {
    const headroom = recommendedPackageBytes - size
    return name + '=' + size +
      (headroom >= 0 ? ' (1.5 MiB headroom ' + headroom + ')' : '')
  })
  .join(', ')

for (const entry of outputStats) {
  if (
    mediaExtensions.has(path.extname(entry.file).toLowerCase()) &&
    entry.size > maximumMediaBytes
  ) {
    failures.push(
      path.relative(outputRoot, entry.file) +
        ' exceeds the 200 KiB media recommendation (' +
        entry.size + ' bytes)'
    )
  }
}

const productionJavaScript = (
  await Promise.all(
    outputFiles
      .filter(file => file.endsWith('.js'))
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
for (const pluginName of Object.keys(appConfig.plugins || {})) {
  if (!hasRuntimePluginUsage(pluginName, productionJavaScript)) {
    failures.push(
      'Plugin ' + pluginName +
        ' is declared but has no production requirePlugin call'
    )
  }
}
if (Object.keys(appConfig.plugins || {}).length) {
  warnings.push(
    'plugin download size is not present in dist; verify the 200 KiB plugin ' +
      'recommendation with the official WeChat performance scan before upload'
  )
}

const allWxmlText = (
  await Promise.all(
    outputFiles
      .filter(file => file.endsWith('.wxml'))
      .map(file => readFile(file, 'utf8'))
  )
).join('\n')
for (const jsonFile of outputFiles.filter(file => file.endsWith('.json'))) {
  const json = JSON.parse(await readFile(jsonFile, 'utf8'))
  const isGlobalConfig =
    path.relative(outputRoot, jsonFile).replace(/\\/g, '/') === 'app.json'
  const localWxmlPath = jsonFile.replace(/\.json$/, '.wxml')
  const localWxml = !isGlobalConfig && outputFiles.includes(localWxmlPath)
    ? await collectWxmlDependencyText(localWxmlPath)
    : undefined
  const unusedComponents = findUnusedDeclaredComponents(
    json.usingComponents,
    localWxml,
    allWxmlText
  )
  for (const componentName of unusedComponents) {
    failures.push(
      path.relative(outputRoot, jsonFile) +
        ' declares unused component ' + componentName
    )
  }
}

const sourceImageRoot = path.resolve('src/assets/cboard-default')
const outputImageRoot = path.join(
  outputRoot,
  'assets/cboard-default'
)
const [sourceImages, outputImages] = await Promise.all([
  collectFileInventory(sourceImageRoot),
  collectFileInventory(outputImageRoot)
])
const sourceImageSizes = new Map(
  sourceImages.map(image => [image.name, image.size])
)
const outputImageSizes = new Map(
  outputImages.map(image => [image.name, image.size])
)
const missingOrChangedImages = outputImages.filter(
  image => sourceImageSizes.get(image.name) !== image.size
)

if (
  outputImages.length !== sourceImages.length ||
  missingOrChangedImages.length
) {
  failures.push(
    'Shared main-package CBoard image output differs from source assets (' +
      outputImages.length + '/' + sourceImages.length + ' files)'
  )
}

const duplicateSubpackageCboardImages = relativeOutputPaths.filter(
  relativePath =>
    relativePath.startsWith('packages/') &&
    relativePath.includes('/assets/cboard-default/')
)
if (duplicateSubpackageCboardImages.length) {
  failures.push(
    'CBoard images must exist only once in the main package; found ' +
      duplicateSubpackageCboardImages.length + ' subpackage copies'
  )
}

const sourceEmergencyRoot = path.resolve('src/assets/emergency')
const outputEmergencyRoot = path.join(
  outputRoot,
  'packages/emergency/assets/emergency'
)
const [
  sourceEmergencyImages,
  outputEmergencyImages
] = await Promise.all([
  collectFileInventory(sourceEmergencyRoot),
  collectFileInventory(outputEmergencyRoot)
])
const sourceEmergencySizes = new Map(
  sourceEmergencyImages.map(image => [image.name, image.size])
)
const missingOrChangedEmergencyImages = outputEmergencyImages.filter(
  image => sourceEmergencySizes.get(image.name) !== image.size
)

if (
  sourceEmergencyImages.length < 3 ||
  outputEmergencyImages.length !== sourceEmergencyImages.length ||
  missingOrChangedEmergencyImages.length
) {
  failures.push(
    'Emergency image output differs from source assets (' +
      outputEmergencyImages.length + '/' + sourceEmergencyImages.length +
      ' files)'
  )
}

const emergencyCboardManifest = JSON.parse(
  await readFile(
    path.join(sourceEmergencyRoot, 'cboard-images.json'),
    'utf8'
  )
)
const expectedEmergencyCboardFiles = new Set(
  emergencyCboardManifest.assets.map(asset => asset.file)
)
const missingOrChangedEmergencyCboardImages = [
  ...expectedEmergencyCboardFiles
].filter(
  name => sourceImageSizes.get(name) !== outputImageSizes.get(name)
)
if (missingOrChangedEmergencyCboardImages.length) {
  failures.push(
    'Emergency CBoard image mappings are missing from shared assets (' +
      (expectedEmergencyCboardFiles.size -
        missingOrChangedEmergencyCboardImages.length) + '/' +
      expectedEmergencyCboardFiles.size + ' files)'
  )
}

for (const outputFile of outputFiles.filter(candidate => candidate.endsWith('.js'))) {
  const source = await readFile(outputFile, 'utf8')
  for (const syntax of unsupportedSyntax) {
    if (source.includes(syntax.token)) {
      failures.push(
        `${path.relative(outputRoot, outputFile)} contains ${syntax.name}`
      )
    }
  }
}

if (failures.length) {
  console.error('Wechat output quality gate failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  const imageBytes = outputImages.reduce((sum, image) => sum + image.size, 0)
  warnings.forEach(warning => console.warn(`Wechat quality warning: ${warning}`))
  console.log(
    'Wechat output compatibility check passed: ' +
      outputImages.length + ' CBoard images / ' + imageBytes +
      ' bytes shared once in main; ' + outputEmergencyImages.length +
      ' emergency metadata/local assets and ' +
      expectedEmergencyCboardFiles.size +
      ' emergency mappings reuse shared CBoard images; ' +
      'uncompressed packages: ' + packageSummary + '.'
  )
}
