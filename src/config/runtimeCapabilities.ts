export type ReleaseChannel = 'development' | 'preview' | 'production'

export interface RuntimeCapabilityEnvironment {
  releaseChannel?: string
  apiBaseUrl?: string
  enableCloudFeatures?: string
  enableAiFeatures?: string
  enableOcr?: string
  enableOnlinePictograms?: string
  enableDialectAsr?: string
}

export interface RuntimeCapabilities {
  releaseChannel: ReleaseChannel
  apiBaseUrl: string
  hasPublicHttpsApi: boolean
  cloudFeatures: boolean
  aiFeatures: boolean
  ocr: boolean
  onlinePictograms: boolean
  dialectAsr: boolean
}

function parseReleaseChannel(value?: string): ReleaseChannel {
  if (value === 'production' || value === 'preview') {
    return value
  }
  return 'development'
}

function isExplicitlyEnabled(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export function isPublicHttpsApiUrl(value?: string): boolean {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '::1' &&
      !hostname.endsWith('.local') &&
      !hostname.endsWith('.test')
    )
  } catch {
    return false
  }
}

export function createRuntimeCapabilities(
  environment: RuntimeCapabilityEnvironment
): RuntimeCapabilities {
  const releaseChannel = parseReleaseChannel(environment.releaseChannel)
  const apiBaseUrl = environment.apiBaseUrl?.trim().replace(/\/+$/, '') || ''
  const hasPublicHttpsApi = isPublicHttpsApiUrl(apiBaseUrl)
  const isProduction = releaseChannel === 'production'
  const apiReady = isProduction ? hasPublicHttpsApi : Boolean(apiBaseUrl)
  const enabled = (value?: string, developmentDefault = false) =>
    isExplicitlyEnabled(value) || (!isProduction && developmentDefault)

  return {
    releaseChannel,
    apiBaseUrl,
    hasPublicHttpsApi,
    cloudFeatures: apiReady && enabled(environment.enableCloudFeatures, true),
    aiFeatures: apiReady && enabled(environment.enableAiFeatures, true),
    ocr: apiReady && enabled(environment.enableOcr, true),
    onlinePictograms: enabled(environment.enableOnlinePictograms, true),
    dialectAsr: apiReady && enabled(environment.enableDialectAsr, true)
  }
}

export const runtimeCapabilities = createRuntimeCapabilities({
  releaseChannel: process.env.TARO_APP_RELEASE_CHANNEL,
  apiBaseUrl: process.env.TARO_APP_API_BASE_URL,
  enableCloudFeatures: process.env.TARO_APP_ENABLE_CLOUD_FEATURES,
  enableAiFeatures: process.env.TARO_APP_ENABLE_AI_FEATURES,
  enableOcr: process.env.TARO_APP_ENABLE_OCR,
  enableOnlinePictograms: process.env.TARO_APP_ENABLE_ONLINE_PICTOGRAMS,
  enableDialectAsr: process.env.TARO_APP_ENABLE_DIALECT_ASR
})

export function apiBaseUrlFor(
  capability: 'cloudFeatures' | 'aiFeatures' | 'ocr' | 'dialectAsr'
): string {
  return runtimeCapabilities[capability] ? runtimeCapabilities.apiBaseUrl : ''
}
