import { describe, expect, it } from 'vitest'
import {
  createRuntimeCapabilities,
  isPublicHttpsApiUrl
} from './runtimeCapabilities'

describe('runtime capabilities', () => {
  it('keeps every optional network feature off in an unconfigured production build', () => {
    expect(createRuntimeCapabilities({ releaseChannel: 'production' })).toEqual({
      releaseChannel: 'production',
      apiBaseUrl: '',
      hasPublicHttpsApi: false,
      cloudFeatures: false,
      aiFeatures: false,
      ocr: false,
      onlinePictograms: false,
      dialectAsr: false
    })
  })

  it('requires explicit flags and a public HTTPS API in production', () => {
    expect(
      createRuntimeCapabilities({
        releaseChannel: 'production',
        apiBaseUrl: 'https://api.picinterpreter.example/',
        enableCloudFeatures: 'true',
        enableAiFeatures: 'true',
        enableOcr: 'true',
        enableOnlinePictograms: 'true',
        enableDialectAsr: 'true'
      })
    ).toMatchObject({
      apiBaseUrl: 'https://api.picinterpreter.example',
      hasPublicHttpsApi: true,
      cloudFeatures: true,
      aiFeatures: true,
      ocr: true,
      onlinePictograms: true,
      dialectAsr: true
    })
  })

  it('rejects local and insecure API origins for production features', () => {
    expect(isPublicHttpsApiUrl('http://api.example.com')).toBe(false)
    expect(isPublicHttpsApiUrl('https://localhost:3000')).toBe(false)
    expect(isPublicHttpsApiUrl('https://127.0.0.1:3000')).toBe(false)
    expect(isPublicHttpsApiUrl('https://api.example.com')).toBe(true)
  })

  it('preserves convenient local integration defaults outside production', () => {
    expect(
      createRuntimeCapabilities({
        releaseChannel: 'preview',
        apiBaseUrl: 'http://127.0.0.1:3000'
      })
    ).toMatchObject({
      cloudFeatures: true,
      aiFeatures: true,
      ocr: true,
      onlinePictograms: true,
      dialectAsr: true
    })
  })
})
