import { describe, expect, test } from 'vitest'
import type { CommunicationRepository } from '@cboard-communication-core/repository'

import { DEFAULT_BOARD_FIXTURES, DEFAULT_BOARD_TILES } from '../../fixtures/defaultBoard'
import { createCommunicationManagementService } from './management'

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
