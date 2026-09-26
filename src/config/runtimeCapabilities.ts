import { createRuntimeCapabilities } from './runtimeCapabilityPolicy'

export { createRuntimeCapabilities, isPublicHttpsApiUrl } from './runtimeCapabilityPolicy'

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
  capability: 'cloudFeatures' | 'aiFeatures' | 'ocr' | 'dialectAsr' | 'onlinePictograms',
  capabilities: RuntimeCapabilities = runtimeCapabilities
): string {
  if (!capabilities[capability]) return ''
  if (
    capability === 'onlinePictograms' &&
    capabilities.releaseChannel === 'production' &&
    !capabilities.hasPublicHttpsApi
  ) {
    return ''
  }
  return capabilities.apiBaseUrl
}
