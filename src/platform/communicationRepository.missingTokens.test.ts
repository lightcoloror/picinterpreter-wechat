import { describe, expect, test } from 'vitest'

import { createWechatCommunicationRepository } from './communicationRepository'

function createMemoryWechatStorage() {
  const values = new Map<string, unknown>()

  return {
    getStorageSync: (key: string) => values.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key)
  }
}

describe('WeChat missing token persistence', () => {
  test('restores aggregated vocabulary gaps through the WeChat storage adapter', () => {
    const storage = createMemoryWechatStorage()
    const repository = createWechatCommunicationRepository(storage)

    repository.recordMissingTokens({
      tokens: ['头晕', '头晕'],
      rawText: '我头晕',
      scene: 'receiver'
    })

    const restoredRepository = createWechatCommunicationRepository(storage)
    restoredRepository.recordMissingTokens({
      tokens: ['头晕'],
      rawText: '还是头晕',
      scene: 'receiver'
    })

    expect(restoredRepository.loadMissingTokens()).toEqual([
      expect.objectContaining({
        normalizedToken: '头晕',
        status: 'new',
        occurrenceCount: 3,
        rawTextSamples: ['还是头晕', '我头晕'],
        patientId: expect.any(String),
        workspaceId: expect.any(String)
      })
    ])
  })

  test('persists caregiver ignore, restore, and pictogram resolution reviews', () => {
    const storage = createMemoryWechatStorage()
    const repository = createWechatCommunicationRepository(storage)
    const [record] = repository.recordMissingTokens({
      tokens: ['头晕'],
      rawText: '我头晕',
      scene: 'receiver'
    })

    expect(
      repository.reviewMissingToken(record.id, { status: 'ignored' })
    ).toEqual(
      expect.objectContaining({
        status: 'ignored',
        reviewedByCaregiver: true
      })
    )
    expect(repository.reviewMissingToken(record.id, { status: 'new' })).toEqual(
      expect.objectContaining({
        status: 'new',
        reviewedByCaregiver: false
      })
    )
    expect(
      repository.reviewMissingToken(record.id, {
        status: 'resolved',
        resolvedPictogramId: 'water-tile',
        source: 'caregiver'
      })
    ).toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'water-tile',
        source: 'caregiver',
        reviewedByCaregiver: true
      })
    )

    const restoredRepository = createWechatCommunicationRepository(storage)
    expect(restoredRepository.loadMissingTokens()).toEqual([
      expect.objectContaining({
        normalizedToken: '头晕',
        status: 'resolved',
        resolvedPictogramId: 'water-tile'
      })
    ])
  })
})
