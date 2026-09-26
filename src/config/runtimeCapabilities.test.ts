import { describe, expect, it } from 'vitest'
import {
  apiBaseUrlFor,
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

  it('validates formal HTTPS API URLs without relying on the global URL constructor', () => {
    const originalUrl = globalThis.URL
    try {
      ;(globalThis as unknown as { URL?: typeof URL }).URL = undefined
      expect(isPublicHttpsApiUrl('https://api.example.com/api')).toBe(true)
      expect(isPublicHttpsApiUrl('https://[2001:db8::1]/api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://user:pass@api.example.com/api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com:0/api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com:65536/api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com:abc/api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com:443/api')).toBe(true)
      expect(isPublicHttpsApiUrl('https://api.example.com:8443/api')).toBe(true)
      expect(isPublicHttpsApiUrl('https://api.example.com/api?key=value')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com/api#section')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com\\api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.example.com/\u0001api')).toBe(false)
      expect(isPublicHttpsApiUrl('HTTPS://api.example.com/api')).toBe(true)
      expect(isPublicHttpsApiUrl('https://service.example.test/api')).toBe(false)
      expect(isPublicHttpsApiUrl('https://api.local/api')).toBe(false)
    } finally {
      ;(globalThis as unknown as { URL?: typeof URL }).URL = originalUrl
    }
  })

  it('rejects IPv4 and IPv6 literals as formal API hosts', () => {
    expect(isPublicHttpsApiUrl('https://192.168.1.20/api')).toBe(false)
    expect(isPublicHttpsApiUrl('https://2130706433/api')).toBe(false)
    expect(isPublicHttpsApiUrl('https://[::1]/api')).toBe(false)
  })

  it('lets explicit false override development defaults while empty values keep them', () => {
    expect(
      createRuntimeCapabilities({
        releaseChannel: 'development',
        apiBaseUrl: 'http://127.0.0.1:3000'
      })
    ).toMatchObject({
      cloudFeatures: true,
      aiFeatures: true,
      ocr: true,
      onlinePictograms: true,
      dialectAsr: true
    })
    expect(
      createRuntimeCapabilities({
        releaseChannel: 'preview',
        apiBaseUrl: 'http://127.0.0.1:3000',
        enableCloudFeatures: 'false',
        enableAiFeatures: ' FALSE ',
        enableOcr: '',
        enableOnlinePictograms: 'false',
        enableDialectAsr: 'no'
      })
    ).toMatchObject({
      cloudFeatures: false,
      aiFeatures: false,
      ocr: true,
      onlinePictograms: false,
      dialectAsr: false
    })
    expect(
      createRuntimeCapabilities({
        releaseChannel: 'production',
        apiBaseUrl: 'https://api.example.com/api',
        enableCloudFeatures: 'true',
        enableAiFeatures: 'false',
        enableOcr: '',
        enableOnlinePictograms: 'true',
        enableDialectAsr: 'yes'
      })
    ).toMatchObject({
      cloudFeatures: true,
      aiFeatures: false,
      ocr: false,
      onlinePictograms: true,
      dialectAsr: false
    })
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

  it('withholds an invalid production API from online pictogram search but allows preview APIs', () => {
    const production = createRuntimeCapabilities({
      releaseChannel: 'production',
      apiBaseUrl: 'http://192.168.1.20:3000',
      enableOnlinePictograms: 'true'
    })
    expect(production.onlinePictograms).toBe(true)
    expect(apiBaseUrlFor('onlinePictograms', production)).toBe('')

    const preview = createRuntimeCapabilities({
      releaseChannel: 'preview',
      apiBaseUrl: 'http://192.168.1.20:3000',
      enableOnlinePictograms: 'true'
    })
    expect(apiBaseUrlFor('onlinePictograms', preview)).toBe('http://192.168.1.20:3000')
  })
})
