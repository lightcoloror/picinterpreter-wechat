const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')

const targetPath = path.resolve(process.env.WEAPP_CLI_INDEX_PATH || '')
const bridgePort = Number(process.env.WEAPP_CLI_BRIDGE_PORT)
const originalJavaScriptLoader = Module._extensions['.js']

if (!targetPath || !Number.isInteger(bridgePort) || bridgePort <= 0) {
  throw new Error('WEAPP_CLI_INDEX_PATH and WEAPP_CLI_BRIDGE_PORT are required')
}

Module._extensions['.js'] = function loadJavaScript(module, filename) {
  if (path.resolve(filename) !== targetPath) {
    return originalJavaScriptLoader(module, filename)
  }

  const source = fs.readFileSync(filename, 'utf8')
  const hardCodedPortMarkers = ['let j=3799;', 'let D=3799;']
  const matchedMarkers = hardCodedPortMarkers.filter(
    marker => source.split(marker).length - 1 === 1
  )
  if (matchedMarkers.length !== 1) {
    throw new Error(
      `Expected one known WeChat CLI bridge-port marker, found ${matchedMarkers.length}`
    )
  }

  const matchedMarker = matchedMarkers[0]
  const replacement = matchedMarker.replace('3799', String(bridgePort))
  return module._compile(
    source.replace(matchedMarker, replacement),
    filename
  )
}
