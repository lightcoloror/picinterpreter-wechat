import { describe, expect, test, vi } from 'vitest'

import type {
  PictogramSearchPort,
  RuntimePictogram
} from './pictogramSearchPort'
import { createFallbackPictogramSearchPort } from './fallbackPictogramSearchPort'

const apiCandidate: RuntimePictogram = {
  id: 'runtime_arasaac_api',
  label: '厕所',
  vocalization: '厕所',
  image: 'https://api.example.test/pictograms/arasaac/1/image',
  backgroundColor: '#ffffff',
  source: {
    provider: 'arasaac',
    originalId: '1',
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: null,
    author: 'Sergio Palao',
    authorUrl: null,
    sourceUrl: 'https://arasaac.org/pictograms/1'
  }
}

const directCandidate: RuntimePictogram = {
  ...apiCandidate,
  id: 'runtime_arasaac_direct',
  image: 'https://static.arasaac.org/pictograms/2/2_300.png',
  source: {
    ...apiCandidate.source,
    originalId: '2',
    sourceUrl: 'https://arasaac.org/pictograms/2'
  }
}

function createPort(configured = true): PictogramSearchPort {
  return {
    configured,
    search: vi.fn(),
    cache: vi.fn()
  }
}

function createHarness(primaryConfigured = true) {
  const primary = createPort(primaryConfigured)
  const fallback = createPort(true)
  const port = createFallbackPictogramSearchPort({
    primary,
    fallback,
    isFallbackPictogram: pictogram =>
      pictogram.image.startsWith('https://static.arasaac.org/')
  })

  return { primary, fallback, port }
}

describe('fallback pictogram search port', () => {
  test('uses cboard-api without touching the direct fallback after success', async () => {
    const { primary, fallback, port } = createHarness()
    vi.mocked(primary.search).mockResolvedValue({
      ok: true,
      message: '已找到候选图，请照护者确认。',
      value: [{ token: '厕所', pictogram: apiCandidate }]
    })

    await expect(port.search(['厕所'])).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        value: [{ token: '厕所', pictogram: apiCandidate }]
      })
    )
    expect(fallback.search).not.toHaveBeenCalled()
  })

  test('falls back to direct ARASAAC only after cboard-api fails', async () => {
    const { primary, fallback, port } = createHarness()
    vi.mocked(primary.search).mockResolvedValue({
      ok: false,
      message: '在线补图服务暂时不可用。'
    })
    vi.mocked(fallback.search).mockResolvedValue({
      ok: true,
      message: '已从 ARASAAC 找到候选图，请照护者确认。',
      value: [{ token: '厕所', pictogram: directCandidate }]
    })

    await expect(port.search(['厕所'])).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        message: expect.stringContaining('已改用 ARASAAC 直连'),
        value: [{ token: '厕所', pictogram: directCandidate }]
      })
    )
    expect(primary.search).toHaveBeenCalledWith(['厕所'])
    expect(fallback.search).toHaveBeenCalledWith(['厕所'])
  })

  test('preserves the actionable WeChat legal-domain message', async () => {
    const { primary, fallback, port } = createHarness()
    vi.mocked(primary.search).mockResolvedValue({
      ok: false,
      message: '网络不可用。'
    })
    vi.mocked(fallback.search).mockResolvedValue({
      ok: false,
      message: '请先在小程序“开发设置 → 服务器域名”中配置 ARASAAC。'
    })

    await expect(port.search(['厕所'])).resolves.toEqual({
      ok: false,
      message:
        'cboard-api 暂时不可用；请先在小程序“开发设置 → 服务器域名”中配置 ARASAAC。'
    })
  })

  test('caches a candidate only through the port that owns its image URL', async () => {
    const { primary, fallback, port } = createHarness()
    vi.mocked(primary.cache).mockResolvedValue({
      ok: true,
      message: 'API 图片已保存。',
      value: apiCandidate
    })
    vi.mocked(fallback.cache).mockResolvedValue({
      ok: true,
      message: 'ARASAAC 图片已保存。',
      value: directCandidate
    })

    await expect(port.cache(apiCandidate)).resolves.toEqual(
      expect.objectContaining({ ok: true, value: apiCandidate })
    )
    expect(primary.cache).toHaveBeenCalledWith(apiCandidate)
    expect(fallback.cache).not.toHaveBeenCalled()

    vi.mocked(primary.cache).mockClear()
    await expect(port.cache(directCandidate)).resolves.toEqual(
      expect.objectContaining({ ok: true, value: directCandidate })
    )
    expect(fallback.cache).toHaveBeenCalledWith(directCandidate)
    expect(primary.cache).not.toHaveBeenCalled()
  })

  test('uses direct ARASAAC when no cboard-api address is configured', async () => {
    const { primary, fallback, port } = createHarness(false)
    vi.mocked(fallback.search).mockResolvedValue({
      ok: true,
      message: '已从 ARASAAC 找到候选图，请照护者确认。',
      value: [{ token: '厕所', pictogram: directCandidate }]
    })

    await expect(port.search(['厕所'])).resolves.toEqual(
      expect.objectContaining({ ok: true })
    )
    expect(primary.search).not.toHaveBeenCalled()
    expect(fallback.search).toHaveBeenCalledWith(['厕所'])
  })
})
