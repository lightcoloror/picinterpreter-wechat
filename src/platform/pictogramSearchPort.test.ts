import { describe, expect, test, vi } from 'vitest'

import { createPictogramSearchPort } from './pictogramSearchPort'

const apiPictogram = {
  id: 'runtime_arasaac_123',
  imageUrl: '/pictograms/arasaac/123/image',
  labels: { zh: ['苹果'], en: ['apple'] },
  source: {
    provider: 'arasaac',
    originalId: '123',
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    author: 'Sergio Palao',
    authorUrl: 'https://arasaac.org/',
    sourceUrl: 'https://arasaac.org/pictograms/123'
  }
}

const openSymbolsApiPictogram = {
  id: 'runtime_opensymbols_medicine',
  imageUrl:
    '/pictograms/opensymbols/signed-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image',
  labels: { zh: ['药瓶'], en: ['medicine bottle'] },
  source: {
    provider: 'opensymbols',
    originalId: 'medicine-bottle',
    name: 'OpenSymbols / mulberry',
    license: 'CC BY-SA 2.0 UK',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/uk/',
    author: 'Paxtoncrafts Charitable Trust',
    authorUrl: 'https://mulberrysymbols.org/',
    sourceUrl:
      'https://www.opensymbols.org/symbols/mulberry/medicine-bottle',
    repoKey: 'mulberry'
  }
}

function createHarness(apiBaseUrl = 'https://api.example.test') {
  const request = vi.fn(async () => ({
    statusCode: 200,
    data: { results: [{ token: '苹果', pictogram: apiPictogram }] }
  }))
  const downloadFile = vi.fn(async () => ({
    statusCode: 200,
    tempFilePath: 'wxfile://temp/apple.png'
  }))
  const saveFile = vi.fn(async () => ({
    savedFilePath: 'wxfile://saved/apple.png'
  }))

  return {
    request,
    downloadFile,
    saveFile,
    port: createPictogramSearchPort({
      apiBaseUrl,
      request,
      downloadFile,
      saveFile
    })
  }
}

describe('pictogramSearchPort', () => {
  test('sends only bounded missing tokens to cboard-api', async () => {
    const harness = createHarness()
    const result = await harness.port.search([
      '苹果',
      '苹果',
      '',
      ...Array.from({ length: 20 }, (_, index) => `词${index}`)
    ])

    expect(result.ok).toBe(true)
    expect(result.value?.[0].pictogram.image).toBe(
      'https://api.example.test/pictograms/arasaac/123/image'
    )
    expect(harness.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/pictograms/search',
        data: { tokens: expect.any(Array) }
      })
    )
    expect(harness.request.mock.calls[0][0].data.tokens).toHaveLength(12)
  })

  test('rejects third-party image URLs returned outside the API domain', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        results: [
          {
            token: '苹果',
            pictogram: { ...apiPictogram, imageUrl: 'https://evil.test/a.png' }
          }
        ]
      }
    })

    await expect(harness.port.search(['苹果'])).resolves.toEqual(
      expect.objectContaining({ ok: true, value: [] })
    )
  })

  test('rejects AI images until a reviewed attribution contract exists', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        results: [
          {
            token: '苹果',
            pictogram: {
              ...apiPictogram,
              source: {
                ...apiPictogram.source,
                provider: 'ai-generated',
                name: 'AI 生成图片'
              }
            }
          }
        ]
      }
    })

    await expect(harness.port.search(['苹果'])).resolves.toEqual(
      expect.objectContaining({ ok: true, value: [] })
    )
    expect(harness.downloadFile).not.toHaveBeenCalled()
  })

  test('downloads and saves a confirmed candidate for offline reuse', async () => {
    const harness = createHarness()
    const search = await harness.port.search(['苹果'])
    const result = await harness.port.cache(search.value![0].pictogram)

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ image: 'wxfile://saved/apple.png' })
      })
    )
    expect(harness.downloadFile).toHaveBeenCalledWith({
      url: 'https://api.example.test/pictograms/arasaac/123/image'
    })
  })

  test('preserves OpenSymbols attribution and caches its API proxy locally', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        results: [
          { token: '药瓶', pictogram: openSymbolsApiPictogram }
        ]
      }
    })

    const search = await harness.port.search(['药瓶'])
    expect(search.value?.[0].pictogram).toEqual(
      expect.objectContaining({
        image:
          'https://api.example.test/pictograms/opensymbols/signed-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image',
        source: expect.objectContaining({
          provider: 'opensymbols',
          name: 'OpenSymbols / mulberry',
          license: 'CC BY-SA 2.0 UK',
          repoKey: 'mulberry'
        })
      })
    )

    const cached = await harness.port.cache(search.value![0].pictogram)
    expect(cached).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          image: 'wxfile://saved/apple.png',
          source: expect.objectContaining({
            provider: 'opensymbols',
            originalId: 'medicine-bottle'
          })
        })
      })
    )
    expect(harness.downloadFile).toHaveBeenCalledWith({
      url:
        'https://api.example.test/pictograms/opensymbols/signed-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image'
    })
  })

  test('keeps offline communication available when no API is configured', async () => {
    const harness = createHarness('')
    await expect(harness.port.search(['苹果'])).resolves.toEqual(
      expect.objectContaining({ ok: false, message: expect.stringContaining('尚未配置') })
    )
    expect(harness.request).not.toHaveBeenCalled()
  })
})
