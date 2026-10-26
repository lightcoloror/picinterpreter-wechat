import { describe, expect, test, vi } from 'vitest'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { createCommunicationManagementService } from './management'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'

describe('personal life contexts through existing WeChat storage and favorites', () => {
  test('favorite, classify, reopen, reuse, export and clear retain exact sentence and synthetic private photo', () => {
    const values = new Map<string, unknown>()
    const api = { getStorageSync: (key: string) => values.get(key) ?? '',
      setStorageSync: vi.fn((key: string, value: unknown) => values.set(key, value)), removeStorageSync: (key: string) => values.delete(key) }
    const repository = createWechatCommunicationRepository(api)
    const sentence = '欧阳明澈今晚不回家吃饭'
    const output = [{ id: 'synthetic-private', label: '欧阳明澈', image: 'wxfile://synthetic-only.png', source: 'user' }]
    repository.appendCommunicationHistory({ direction: 'express', sentence, labels: ['欧阳明澈'], output })
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES })
    const original = service.loadHistory()[0]
    service.toggleHistoryFavorite(original.id)
    const favorite = service.loadSavedPhrases()[0]
    service.assignLifeContext(favorite.id, '  饭后散步  ')
    const writes = api.setStorageSync.mock.calls.length
    service.assignLifeContext(favorite.id, '饭后散步')
    expect(api.setStorageSync.mock.calls.length).toBe(writes)
    const reopened = createCommunicationManagementService({ repository: createWechatCommunicationRepository(api), boards: DEFAULT_BOARD_FIXTURES })
    const saved = reopened.loadSavedPhrases()[0]
    expect(saved).toEqual({ ...favorite, lifeContext: '饭后散步' })
    expect(reopened.getQuickPhrases()[0].sentence).toBe(sentence)
    expect(saved.output[0].image).toBe(output[0].image)
    expect(reopened.exportSavedPhrases()).toContain('饭后散步')
    expect(reopened.loadHistory()[0].sentence).toBe(original.sentence)
    expect(reopened.loadHistory()[0].output).toEqual(original.output)
    expect(reopened.loadHistory()[0]).not.toHaveProperty('lifeContext')
    reopened.assignLifeContext(saved.id, '')
    expect(createWechatCommunicationRepository(api).loadCommunicationSavedPhrases()[0].lifeContext).toBe('')
    const isolated = new Map<string, string>()
    const other = createWechatCommunicationRepository({ getStorageSync: k => isolated.get(k), setStorageSync: (k,v) => { isolated.set(k,v) }, removeStorageSync: k => { isolated.delete(k) } })
    expect(other.loadCommunicationSavedPhrases()).toEqual([])
  })
})
