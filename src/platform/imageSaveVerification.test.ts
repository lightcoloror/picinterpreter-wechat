import { describe, expect, it, vi } from 'vitest'
import { createPersonalImagePort } from './personalImagePort'
import { createPictogramSearchPort } from './pictogramSearchPort'

describe('saved image bytes, not just returned paths', () => {
  for (const status of ['missing', 'corrupt', 'check-failed', 'temporary']) {
    it(`rejects a personal image when final image is ${status}`, async () => {
      const verifyImage = vi.fn(async () => ({ status }))
      const port = createPersonalImagePort({
        chooseImage: async () => ({ tempFilePath: 'wxfile://tmp/selected.png' }),
        saveFile: async () => ({ savedFilePath: 'wxfile://usr/saved.png' }),
        removeSavedFile: async () => {}, verifyImage
      } as any)
      expect((await port.selectAndSave()).ok).toBe(false)
      expect(verifyImage).toHaveBeenCalledWith('wxfile://usr/saved.png')
    })
  }
  it('does not adopt an online image whose saved bytes are corrupt', async () => {
    const verifyImage = vi.fn(async () => ({ status: 'corrupt' }))
    const port = createPictogramSearchPort({
      apiBaseUrl: 'https://api.example.test/api', request: vi.fn(),
      downloadFile: async () => ({ statusCode: 200, tempFilePath: 'tmp.png' }),
      saveFile: async () => ({ savedFilePath: 'wxfile://usr/public.png' }), verifyImage
    } as any)
    const result = await port.cache({ id: 'arasaac-123', label: '苹果',
      image: 'https://api.example.test/api/pictograms/arasaac/123/image',
      source: { provider: 'arasaac', originalId: '123', name: 'ARASAAC', license: 'CC BY-NC-SA 4.0', sourceUrl: 'https://arasaac.org/pictograms/123' }
    } as any)
    expect(result.ok).toBe(false)
    expect(verifyImage).toHaveBeenCalledWith('wxfile://usr/public.png')
  })
})
