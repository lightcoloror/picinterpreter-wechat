import { describe, expect, test } from 'vitest'
import type { CommunicationRepository } from '@cboard-communication-core/repository'

import { DEFAULT_BOARD_FIXTURES, DEFAULT_BOARD_TILES } from '../../fixtures/defaultBoard'
import { createCommunicationManagementService } from './management'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'

function createRepository(): CommunicationRepository {
  let savedPhrases: any[] = []
  let savedPhraseTombstones: any[] = []
  let history: any[] = [
    {
      id: 'history-1',
      sessionId: 'session-1',
      direction: 'express',
      sentence: '我要喝水',
      labels: ['水'],
      candidateSentences: ['我要喝水', '请给我水'],
      candidates: [
        { sentence: '我要喝水', feedback: null },
        { sentence: '请给我水', feedback: null }
      ],
      createdAt: 100,
      isFavorite: false
    }
  ]

  return {
    loadCommunicationIdentity: () => ({workspaceId: "synthetic", patientId: "synthetic"}),
    savedPhraseCapacity: 100,
    loadCommunicationSavedPhrases: () => savedPhrases,
    overwriteCommunicationSavedPhrases: items => {
      savedPhrases = items
    },
    deleteCommunicationSavedPhrase: id => {
      const phrase = savedPhrases.find(item => item.id === id)
      if (!phrase) return null
      savedPhrases = savedPhrases.filter(item => item.id !== id)
      const tombstone = {
        id,
        deletedAt: 500,
        deletedBy: 'local',
        serverVersion: phrase.serverVersion || 0,
        pending: true
      }
      savedPhraseTombstones = [tombstone, ...savedPhraseTombstones]
      return tombstone
    },
    loadCommunicationSavedPhraseTombstones: () => savedPhraseTombstones,
    loadCommunicationHistory: () => history,
    overwriteCommunicationHistory: items => {
      history = items
    }
  } as CommunicationRepository
}

describe('WeChat communication management service', () => {
  test('history favorite retries a lost write receipt without a second favorite or altered images', () => {
    const values = new Map<string, unknown>([['cboard_communication_saved_phrases', JSON.stringify(Array.from({ length: 99 }, (_, index) => ({
      id: `old-${index}`, sentence: `合成旧句${index}`, output: [], createdAt: index + 1
    })))]] )
    const repository = createWechatCommunicationRepository({
      getStorageSync: key => values.get(key) ?? '', setStorageSync: (key, value) => { values.set(key, value) }, removeStorageSync: key => { values.delete(key) }
    })
    repository.overwriteCommunicationHistory([{ id: 'history-receipt', direction: 'express', createdAt: 10, sentence: '我今晚不回家吃饭',
      output: [{ id: 'same', label: '合成林安', personId: 'synthetic-a' }, { id: 'same', label: '合成林安', personId: 'synthetic-b' }] }])
    const before = repository.loadCommunicationHistory()
    const write = repository.overwriteCommunicationSavedPhrases
    let writes = 0
    repository.overwriteCommunicationSavedPhrases = (...args) => {
      const saved = write(...args); writes++
      if (writes === 1) throw new Error('合成写入后回执失败')
      return saved
    }
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES })
    expect(() => service.toggleHistoryFavorite('history-receipt')).toThrow(/回执失败/)
    expect(repository.loadCommunicationHistory()).toEqual(before)
    expect(repository.loadCommunicationSavedPhrases()).toHaveLength(100)
    const saved = repository.loadCommunicationSavedPhrases()
    service.toggleHistoryFavorite('history-receipt')
    expect(writes).toBe(1)
    expect(repository.loadCommunicationSavedPhrases()).toEqual(saved)
    expect(repository.loadCommunicationHistory()[0].isFavorite).toBe(true)
    expect(repository.loadCommunicationHistory()[0].output).toEqual(before[0].output)
  })
  test.each([99, 100, 101])('real adapter protects %i existing phrases during history favorite and retry', count => {
    const previous = Array.from({ length: count }, (_, index) => ({
      id: `capacity-${index}`, sentence: `合成表达${index}`, createdAt: index + 1,
      output: [{ id: 'same', label: '合成林安', personId: `synthetic-${index}`, image: '/synthetic.png' }]
    }))
    const values = new Map<string, unknown>([['cboard_communication_saved_phrases', JSON.stringify(previous)]])
    let fail = false
    const api = { getStorageSync: (key: string) => values.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => {
        if (fail && key.includes('favorite_state')) throw new Error('合成收藏写入失败')
        values.set(key, value)
      }, removeStorageSync: (key: string) => { values.delete(key) } }
    const repository = createWechatCommunicationRepository(api)
    repository.overwriteCommunicationHistory([{
      id: 'synthetic-history', sentence: '我今晚不回家吃饭', direction: 'express', createdAt: 2,
      output: [{ id: 'same', label: '合成林安', personId: 'synthetic-a' }, { id: 'same', label: '合成林安', personId: 'synthetic-b' }]
    }])
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES })
    const before = repository.loadCommunicationSavedPhrases(), historyBefore = repository.loadCommunicationHistory()
    if (count >= 100) {
      expect(() => service.toggleHistoryFavorite('synthetic-history')).toThrow(/容量上限/)
      expect(repository.loadCommunicationSavedPhrases()).toEqual(before)
      expect(repository.loadCommunicationHistory()).toEqual(historyBefore)
      while (repository.loadCommunicationSavedPhrases().length >= 100)
        repository.deleteCommunicationSavedPhrase(repository.loadCommunicationSavedPhrases().at(-1)!.id)
    } else {
      fail = true
      expect(() => service.toggleHistoryFavorite('synthetic-history')).toThrow(/合成收藏写入失败/)
      expect(repository.loadCommunicationHistory()).toEqual(historyBefore)
      expect(repository.loadCommunicationSavedPhrases()).toEqual(before)
      fail = false
    }
    service.toggleHistoryFavorite('synthetic-history')
    const reopened = createWechatCommunicationRepository(api)
    expect(reopened.loadCommunicationSavedPhrases()).toHaveLength(100)
    expect(reopened.loadCommunicationSavedPhrases().filter(item => item.sentence === '我今晚不回家吃饭')).toHaveLength(1)
    expect(reopened.loadCommunicationSavedPhrases().find(item => item.sentence === '我今晚不回家吃饭')!.output).toEqual(historyBefore[0].output)
    expect(reopened.loadCommunicationHistory()[0].isFavorite).toBe(true)
    expect(reopened.loadCommunicationHistory()[0].output).toEqual(historyBefore[0].output)
    for (const old of repository.loadCommunicationSavedPhrases().filter(item => item.id.startsWith('capacity-')))
      expect(old).toEqual(before.find(item => item.id === old.id))
  })
  test('two-phase import preserves existing phrases, refreshes stale previews and keeps retry safe', () => {
    const repository = createRepository()
    let scope = 'one'
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES, getScopeKey: () => scope })
    const payload = JSON.stringify({format:'cboard-communication-saved-phrases',version:1,phrases:[{id:'new',sentence:'合成新句',output:[]}]})
    expect(service.previewSavedPhrases(payload).wouldAddCount).toBe(1)
    expect(repository.loadCommunicationSavedPhrases()).toHaveLength(0)
    repository.overwriteCommunicationSavedPhrases([{id:'old',sentence:'合成旧句',output:[]}] as any)
    expect(service.confirmSavedPhrasesImport().refreshed).toBe(true)
    const write = repository.overwriteCommunicationSavedPhrases
    repository.overwriteCommunicationSavedPhrases = () => { throw new Error('synthetic full') }
    expect(() => service.confirmSavedPhrasesImport()).toThrow('synthetic full')
    repository.overwriteCommunicationSavedPhrases = write
    expect(service.confirmSavedPhrasesImport().committed).toBe(true)
    expect(repository.loadCommunicationSavedPhrases()).toHaveLength(2)
    expect(service.previewSavedPhrases(payload).duplicateCount).toBe(1)
    service.cancelSavedPhrasesImport()
    expect(() => service.confirmSavedPhrasesImport()).toThrow(/预览/)
    service.previewSavedPhrases(payload)
    scope = 'two'
    expect(() => service.confirmSavedPhrasesImport()).toThrow(/档案/)
  })
  test('favorites the corrected receiver image snapshot independently', () => {
    const repository = createRepository()
    repository.overwriteCommunicationHistory([{
      ...repository.loadCommunicationHistory()[0], direction: 'receive', recordStatus: 'confirmed', inputText: '水',
      output: [{ id: 'old', label: '旧图', image: '/old.png' }],
      pictogramSequence: [{ pictogramId: 'old', label: '旧图' }]
    }])
    const corrected = [{ id: 'new', label: '水杯', image: '/private/new.png', attribution: { source: 'synthetic' } }]
    repository.loadReceiverCorrections = () => [{
      id: 'correction-1', expressionId: 'history-1', context: 'caregiver_history_review', createdAt: 200,
      revisionAfter: { labels: ['水杯'], output: corrected, pictogramSequence: [{ pictogramId: 'new', label: '水杯' }] }
    }] as any
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES })
    service.toggleHistoryFavorite('history-1')
    corrected[0].image = '/later.png'
    service.deleteHistory('history-1')
    expect(service.loadSavedPhrases()[0].output).toEqual([expect.objectContaining({ id: 'new', image: '/private/new.png', attribution: { source: 'synthetic' } })])
  })

  test('keeps an independent favorite after the source history is removed', () => {
    const repository = createRepository()
    const output = [{ id: 'water-private', label: '水', image: '/private/water.png' }]
    repository.overwriteCommunicationHistory([{
      ...repository.loadCommunicationHistory()[0], output
    }])
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES, now: () => 501 })
    service.toggleHistoryFavorite('history-1')
    service.deleteHistory('history-1')
    expect(service.loadHistory()).toEqual([])
    expect(service.loadSavedPhrases()).toEqual([expect.objectContaining({ sentence: '我要喝水', output })])
    expect(service.getQuickPhrases()[0].sentence).toBe('我要喝水')
  })

  test('does not mark history as saved when independent persistence fails', () => {
    const repository = createRepository()
    repository.overwriteCommunicationSavedPhrases = () => { throw new Error('storage full') }
    const service = createCommunicationManagementService({ repository, boards: DEFAULT_BOARD_FIXTURES })
    expect(() => service.toggleHistoryFavorite('history-1')).toThrow('storage full')
    expect(repository.loadCommunicationHistory()[0].isFavorite).toBe(false)
  })

  test('persists phrase CRUD, usage and compatible import/export', () => {
    const repository = createRepository()
    const service = createCommunicationManagementService({
      repository,
      boards: DEFAULT_BOARD_FIXTURES,
      now: () => 500
    })
    const water = DEFAULT_BOARD_TILES.find(tile => tile.label === '水')!

    let phrases = service.addSavedPhrase('我要喝水', [water])
    phrases = service.renameSavedPhrase(phrases[0].id, '请给我水')
    phrases = service.markSavedPhraseUsed(phrases[0].id)

    expect(phrases[0]).toEqual(expect.objectContaining({
      sentence: '请给我水',
      usageCount: 1,
      lastUsedAt: 500
    }))
    expect(service.exportSavedPhrases()).toContain('picinterpreter')

    const imported = service.importSavedPhrases(
      JSON.stringify({
        version: 1,
        appId: 'tuyujia',
        phrases: [
          {
            id: 'legacy-water',
            sentence: '水',
            pictogramIds: [water.id],
            usageCount: 2,
            lastUsedAt: 20
          }
        ]
      })
    )
    expect(imported).toEqual(expect.objectContaining({
      ok: true,
      addedCount: 1,
      missingPictogramCount: 0
    }))

    phrases = service.deleteSavedPhrase(phrases[0].id)
    expect(phrases.map(item => item.id)).toEqual(['legacy-water'])
  })

  test('persists history and exports readable text plus Open Board Logging 0.1', () => {
    const service = createCommunicationManagementService({
      repository: createRepository(),
      boards: DEFAULT_BOARD_FIXTURES,
      now: () => 500
    })

    const favorited = service.toggleHistoryFavorite('history-1')
    expect(favorited[0].isFavorite).toBe(true)
    const rated = service.updateHistoryCandidateFeedback(
      'history-1',
      0,
      'up'
    )
    expect(rated[0].candidates).toEqual([
      { sentence: '我要喝水', feedback: 'up' },
      { sentence: '请给我水', feedback: null }
    ])
    const cancelled = service.updateHistoryCandidateFeedback(
      'history-1',
      0,
      'up'
    )
    expect(cancelled[0].candidates?.[0].feedback).toBe(null)
    expect(service.exportHistory()).toContain('句子：我要喝水')
    const openBoardLogText = service.exportHistoryOpenBoardLog()
    const openBoardLog = JSON.parse(
      openBoardLogText.slice(openBoardLogText.indexOf('{'))
    )
    expect(openBoardLog).toEqual(expect.objectContaining({
      format: 'open-board-log-0.1',
      source: 'picinterpreter-wechat',
      locale: 'zh-CN'
    }))
    expect(openBoardLog).not.toHaveProperty('anonymized')
    expect(openBoardLog.sessions[0].events[0]).toEqual(
      expect.objectContaining({
        type: 'utterance',
        text: '我要喝水',
        modeling: false
      })
    )
    const anonymizedText = service.exportHistoryAnonymizedOpenBoardLog()
    const anonymizedLog = JSON.parse(
      anonymizedText.slice(anonymizedText.indexOf('{'))
    )
    expect(anonymizedLog).toEqual(expect.objectContaining({
      format: 'open-board-log-0.1',
      source: 'picinterpreter-wechat',
      anonymized: true,
      user_id: 'user-1'
    }))
    expect(anonymizedLog.sessions[0].events[0]).toEqual(
      expect.objectContaining({
        type: 'utterance',
        text: ':fringe-1',
        redacted: true
      })
    )
    expect(anonymizedText).not.toContain('我要喝水')
    expect(anonymizedText).not.toContain('ext_picinterpreter')
    const rejectedAnonymized = service.importHistoryOpenBoardLog(anonymizedText)
    expect(rejectedAnonymized).toEqual(expect.objectContaining({
      ok: false,
      addedCount: 0,
      anonymized: true
    }))
    expect(rejectedAnonymized.error).toContain('匿名研究日志不能恢复')
    expect(service.loadHistory()).toHaveLength(1)
    const imported = service.importHistoryOpenBoardLog(
      JSON.stringify({
        format: 'open-board-log-0.1',
        user_id: 'external-user',
        sessions: [
          {
            id: 'external-session',
            type: 'log',
            events: [
              {
                id: 'external-event',
                timestamp: '2026-07-20T10:00:00.000Z',
                type: 'utterance',
                text: '请慢慢喝',
                modeling: true
              }
            ]
          }
        ]
      })
    )
    expect(imported).toEqual(expect.objectContaining({
      ok: true,
      addedCount: 1
    }))
    expect(service.loadHistory()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'receive',
        inputText: '请慢慢喝',
        localOnly: true,
        importSource: 'open-board-log'
      })
    ]))
    expect(service.getHistoryReplayText(favorited[0])).toBe('我要喝水')
    expect(service.deleteHistory('history-1')).toEqual([
      expect.objectContaining({
        inputText: '请慢慢喝',
        localOnly: true
      })
    ])
    expect(service.clearHistory()).toEqual([])
  })
})
