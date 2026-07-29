import { describe, expect, test } from 'vitest'

import { DEFAULT_BOARD_TILES } from '../fixtures/defaultBoard'
import { createWechatCommunicationRepository } from './communicationRepository'

const WATER_TILE = DEFAULT_BOARD_TILES.find(tile => tile.id === 'SystfA56X5KZ')!

function createMemoryWechatStorage() {
  const values = new Map<string, unknown>()

  return {
    getStorageSync: (key: string) => values.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key)
  }
}

describe('WeChat receiver lifecycle persistence', () => {
  test('restores a draft without exposing it in confirmed history', () => {
    const repository = createWechatCommunicationRepository(
      createMemoryWechatStorage()
    )
    const entry = {
      contractVersion: 1,
      direction: 'receive',
      inputText: '想喝水',
      labels: ['水'],
      output: [WATER_TILE],
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
    }

    const draft = repository.createReceiverDraft(entry)

    expect(repository.loadCommunicationHistory()).toEqual([])
    expect(repository.loadReceiverRecords()[0]).toEqual(
      expect.objectContaining({
        id: draft.id,
        recordStatus: 'draft',
        patientId: expect.any(String),
        workspaceId: expect.any(String)
      })
    )

    repository.confirmReceiverDraft(draft, entry)

    expect(repository.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        id: draft.id,
        direction: 'receive',
        recordStatus: 'confirmed'
      })
    )
  })

  test('keeps one resumable receiver record and clears it explicitly', () => {
    const repository = createWechatCommunicationRepository(
      createMemoryWechatStorage()
    )
    const entry = {
      contractVersion: 1,
      direction: 'receive',
      inputText: '想喝水',
      labels: ['水'],
      output: [WATER_TILE],
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
    }
    const first = repository.createReceiverDraft(entry)
    const second = repository.createReceiverDraft({
      ...entry,
      inputText: '需要休息'
    })

    expect(second.id).not.toBe(first.id)
    expect(
      repository
        .loadReceiverRecords()
        .filter(record => record.recordStatus === 'draft')
    ).toEqual([
      expect.objectContaining({
        id: second.id,
        inputText: '需要休息'
      })
    ])
    expect(repository.loadResumableReceiverRecord()).toEqual(
      expect.objectContaining({ id: second.id })
    )
    expect(repository.discardResumableReceiverRecord(second.id)).toBe(true)
    expect(repository.loadResumableReceiverRecord()).toBeNull()

    const draft = repository.createReceiverDraft(entry)
    const confirmed = repository.confirmReceiverDraft(draft, entry)
    repository.recordReceiverPatientFeedback(
      confirmed.id,
      'not_understood'
    )
    expect(repository.loadResumableReceiverRecord()).toEqual(
      expect.objectContaining({
        id: confirmed.id,
        patientFeedback: 'not_understood'
      })
    )

    repository.recordReceiverPatientFeedback(confirmed.id, 'understood')
    expect(repository.loadResumableReceiverRecord()).toBeNull()
  })
})
