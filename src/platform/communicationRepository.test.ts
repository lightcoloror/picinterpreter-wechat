import { describe, expect, test } from 'vitest'

import { DEFAULT_BOARD_TILES } from '../fixtures/defaultBoard'
import { createWechatCommunicationRepository } from './communicationRepository'

const WANT_TILE = DEFAULT_BOARD_TILES.find(tile => tile.id === 'r1oHfCqTm9Yb')!
const WATER_TILE = DEFAULT_BOARD_TILES.find(tile => tile.id === 'SystfA56X5KZ')!

describe('WeChat communication repository bridge', () => {
  test('persists and restores an expression through WeChat sync storage', () => {
    const values = new Map<string, unknown>()
    const repository = createWechatCommunicationRepository({
      getStorageSync: key => values.get(key) ?? '',
      setStorageSync: (key, value) => values.set(key, value),
      removeStorageSync: key => values.delete(key)
    })

    repository.appendCommunicationHistory({
      contractVersion: 1,
      direction: 'express',
      sentence: '我想要水。',
      labels: ['我想要', '水'],
      output: [WANT_TILE, WATER_TILE],
      candidateSentences: ['我想要水。']
    })

    expect(repository.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        sentence: '我想要水。',
        labels: ['我想要', '水']
      })
    )
  })

  test('shares a session and exposes only confirmed receive context', () => {
    const values = new Map<string, unknown>()
    const repository = createWechatCommunicationRepository({
      getStorageSync: key => values.get(key) ?? '',
      setStorageSync: (key, value) => values.set(key, value),
      removeStorageSync: key => values.delete(key)
    })
    const session = repository.getActiveConversationSession()

    repository.appendCommunicationHistory({
      direction: 'express',
      sentence: '我想要水。',
      labels: ['我想要', '水'],
      output: [WANT_TILE, WATER_TILE]
    })
    const draft = repository.createReceiverDraft({
      direction: 'receive',
      inputText: '你想喝水吗',
      labels: ['喝', '水']
    })

    expect(repository.loadConversationContext().turns).toHaveLength(1)

    repository.confirmReceiverDraft(draft, {
      direction: 'receive',
      inputText: '你想喝水吗',
      labels: ['喝', '水']
    })

    expect(draft.sessionId).toBe(session.id)
    expect(repository.loadConversationContext()).toEqual({
      contractVersion: 1,
      sessionId: session.id,
      turns: expect.arrayContaining([
        expect.objectContaining({
          direction: 'express',
          text: '我想要水。'
        }),
        expect.objectContaining({
          direction: 'receive',
          text: '你想喝水吗'
        })
      ])
    })

    const nextSession = repository.resetConversationSession()
    expect(nextSession.id).not.toBe(session.id)
    expect(repository.loadConversationContext().turns).toEqual([])
    expect(repository.loadCommunicationHistory()).toHaveLength(2)
  })

  test('persists the confirmed caregiver text-to-image result', () => {
    const values = new Map<string, unknown>()
    const repository = createWechatCommunicationRepository({
      getStorageSync: key => values.get(key) ?? '',
      setStorageSync: (key, value) => values.set(key, value),
      removeStorageSync: key => values.delete(key)
    })

    repository.appendCommunicationHistory({
      contractVersion: 1,
      direction: 'receive',
      inputText: '想喝水',
      labels: ['我想要', '喝', '水'],
      output: [
        {
          id: WATER_TILE.id,
          image: WATER_TILE.image,
          label: WATER_TILE.label,
          vocalization: WATER_TILE.vocalization
        }
      ],
      pictogramSequence: [
        {
          pictogramId: WATER_TILE.id,
          label: WATER_TILE.label,
          source: 'local_dict',
          boardId: WATER_TILE.boardId,
          matchType: 'exact',
          confidence: 1,
          originalToken: '水'
        }
      ]
    })

    expect(repository.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        direction: 'receive',
        inputText: '想喝水',
        pictogramSequence: [
          expect.objectContaining({
            originalToken: '水',
            matchType: 'exact',
            confidence: 1
          })
        ]
      })
    )
  })

  test('persists and deduplicates common phrases through WeChat storage', () => {
    const values = new Map<string, unknown>()
    const repository = createWechatCommunicationRepository({
      getStorageSync: key => values.get(key) ?? '',
      setStorageSync: (key, value) => values.set(key, value),
      removeStorageSync: key => values.delete(key)
    })

    repository.saveCommunicationPhrase({
      contractVersion: 1,
      sentence: '我想要水。',
      output: [WANT_TILE, WATER_TILE]
    })
    repository.saveCommunicationPhrase({
      contractVersion: 1,
      sentence: '我想要水。',
      output: [WATER_TILE]
    })

    const saved = repository.loadCommunicationSavedPhrases()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        sentence: '我想要水。',
        output: [expect.objectContaining({ id: WATER_TILE.id })],
        createdAt: expect.any(Number)
      })
    )
    expect(
      JSON.parse(String(values.get('cboard_communication_saved_phrases')))
    ).toHaveLength(1)
    expect(
      JSON.parse(String(values.get('cboard_tuyujia_saved_phrases')))
    ).toHaveLength(1)
  })
})
