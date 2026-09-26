// CommonJS lets the Taro Node config loader and the mini-program bundle reuse
// the same pure policy without loading application state or browser globals.
const UrlParse = require('url-parse')

function isPublicHttpsApiUrl(value) {
  const input = String(value || '').trim()
  if (!/^https:\/\//i.test(input) || /[\u0000-\u001f\u007f\\?#]/.test(input)) return false
  try {
    const url = new UrlParse(input, '')
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
    const authority = input.match(/^https:\/\/([^/?#]*)/i)[1]
    const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1)
    const portSpecified = /:\d*$/.test(hostAndPort)
    const portMatch = hostAndPort.match(/:(\d+)$/)
    const port = url.port || (portMatch ? portMatch[1] : '')
    const labels = hostname.split('.')
    const isIpLiteral = hostname.includes(':') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
      // Include integer, octal and hexadecimal IPv4 representations.
      /^(?:(?:0x[\da-f]+|0[0-7]*|\d+)(?:\.|$))+$/i.test(hostname)
    const validDnsName = hostname.length <= 253 && labels.length > 1 &&
      labels.every(label => label.length > 0 && label.length <= 63 &&
        /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
    const validPort = portSpecified
      ? /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535
      : !port
    return Boolean(url.protocol === 'https:' && !url.auth && !url.username && !url.password &&
      validDnsName && !isIpLiteral && validPort &&
      !['localhost', 'local', 'test', 'invalid', 'internal', 'home.arpa']
        .some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`)))
  } catch (_) {
    return false
  }
}

function createRuntimeCapabilities(environment) {
  const releaseChannel = ['production', 'preview'].includes(environment.releaseChannel)
    ? environment.releaseChannel : 'development'
  const apiBaseUrl = String(environment.apiBaseUrl || '').trim().replace(/\/+$/, '')
  const hasPublicHttpsApi = isPublicHttpsApiUrl(apiBaseUrl)
  const isProduction = releaseChannel === 'production'
  const apiReady = isProduction ? hasPublicHttpsApi : Boolean(apiBaseUrl)
  const enabled = value => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized) return normalized === 'true'
    return !isProduction
  }
  return {
    releaseChannel, apiBaseUrl, hasPublicHttpsApi,
    cloudFeatures: apiReady && enabled(environment.enableCloudFeatures),
    aiFeatures: apiReady && enabled(environment.enableAiFeatures),
    ocr: apiReady && enabled(environment.enableOcr),
    onlinePictograms: enabled(environment.enableOnlinePictograms),
    dialectAsr: apiReady && enabled(environment.enableDialectAsr)
  }
}

module.exports = { isPublicHttpsApiUrl, createRuntimeCapabilities }
