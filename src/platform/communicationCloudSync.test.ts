import { describe, expect, test, vi } from 'vitest'

import { createCommunicationCloudSyncService } from './communicationCloudSync'
import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from '@cboard-communication-core/repository'

test('care mode without an active profile never falls back to legacy network routes', async () => {
  vi.stubEnv('TARO_APP_CARE_COLLABORATION', 'true')
  try {
    const harness = createHarness()
    expect((await harness.service.sync('token')).ok).toBe(false)
    expect((await harness.service.upload('token')).ok).toBe(false)
    expect((await harness.service.syncReceiverRecords('token')).ok).toBe(true)
    expect((await harness.service.deleteReceiverRecords('token', [], { deleteAll: true })).ok).toBe(true)
    for (const request of Object.values(harness.settingsPort)) expect(request).not.toHaveBeenCalled()
    expect(harness.repository.loadReceiverRecords()).toEqual([])
  } finally { vi.unstubAllEnvs() }
})

function createHarness() {
  let savedPhrases = [{
    id: 'phrase-local',
    sentence: '我想喝水',
    output: [],
    usageCount: 0,
    createdAt: 100,
    lastUsedAt: 100,
    updatedAt: 100
  }]
  let savedPhraseTombstones: any[] = []
  let history = [{
    id: 'history-local',
    direction: 'express' as const,
    sentence: '我想喝水',
    labels: ['水'],
    createdAt: 100
  }]
  let receiverRecords = [{
    id: 'receiver-local',
    sessionId: 'session-local',
    patientId: 'patient-local',
    workspaceId: 'workspace-local',
    direction: 'receive' as const,
    recordStatus: 'confirmed' as const,
    inputText: '请给我水',
    labels: ['水'],
    createdAt: 150,
    updatedAt: 150,
    confirmedAt: 150
  }]
  const repository = {
    readFavoriteState: vi.fn(() => ({ version: 1 as const, generation: 'g1', scope: 'synthetic', revision: 0,
      phrases: savedPhrases, tombstones: savedPhraseTombstones, pending: null })),
    commitFavoriteState: vi.fn((expected, changes) => {
      savedPhrases = changes.phrases
      savedPhraseTombstones = changes.tombstones
      return { ...expected, ...changes, revision: expected.revision + 1 }
    }),
    loadCommunicationSavedPhrases: vi.fn(() => savedPhrases),
    loadCommunicationSavedPhraseTombstones: vi.fn(
      () => savedPhraseTombstones
    ),
    loadCommunicationHistory: vi.fn(() => history),
    loadReceiverRecords: vi.fn(() => receiverRecords),
    overwriteCommunicationSavedPhrases: vi.fn(value => {
      savedPhrases = value
    }),
    overwriteCommunicationSavedPhraseTombstones: vi.fn(value => {
      savedPhraseTombstones = value
    }),
    deleteCommunicationSavedPhrase: vi.fn((id: string) => {
      const phrase = savedPhrases.find(item => item.id === id)
      if (!phrase) {
        return null
      }
      savedPhrases = savedPhrases.filter(item => item.id !== id)
      const tombstone = {
        id,
        deletedAt: 300,
        deletedBy: 'local',
        serverVersion:
          Number((phrase as { serverVersion?: number }).serverVersion) || 0,
        pending: true
      }
      savedPhraseTombstones = [tombstone, ...savedPhraseTombstones]
      return tombstone
    }),
    overwriteCommunicationHistory: vi.fn(value => {
      history = value
    }),
    overwriteReceiverRecords: vi.fn(value => {
      receiverRecords = value
    }),
    retireAnonymousUserIdentity: vi.fn(() => ({
      status: 'retired'
    }))
  }
  const settingsPort = {
    getSettings: vi.fn(async () => ({
      ok: true,
      message: 'ok',
      value: {
        tuyujia: {
          savedPhrases: [{
            id: 'phrase-remote',
            sentence: '我要去厕所',
            output: [],
            usageCount: 0,
            createdAt: 200,
            lastUsedAt: 200,
            updatedAt: 200
          }],
          history: []
        }
      }
    })),
    updateSettings: vi.fn(async () => ({
      ok: true,
      message: 'ok',
      value: {}
    })),
    syncConfirmedReceiverRecords: vi.fn(async (_token, records) => ({
      ok: true,
      message: 'ok',
      value: {
        acceptedCount: records.length,
        conflictCount: 0,
        conflictedRecordIds: [],
        records,
        deletedRecordIds: [],
        deletedRecords: []
      }
    })),
    deleteConfirmedReceiverRecords: vi.fn(async (_token, recordIds) => ({
      ok: true,
      message: 'ok',
      value: {
        deletedCount: recordIds.length,
        deletedRecordIds: recordIds,
        deletedRecords: []
      }
    })),
    syncCommunicationSavedPhrases: vi.fn(async (_token, phrases) => ({
      ok: true,
      message: 'ok',
      value: {
        acceptedCount: phrases.length,
        conflictCount: 0,
        conflictedPhraseIds: [],
        phrases: phrases.map(item => ({
          ...item,
          serverVersion: item.serverVersion || 1
        })),
        deletedPhraseIds: [],
        deletedPhrases: []
      }
    })),
    deleteCommunicationSavedPhrases: vi.fn(
      async (_token, phraseIds) => ({
        ok: true,
        message: 'ok',
        value: {
          deletedCount: phraseIds.length,
          deletedPhraseIds: phraseIds,
          deletedPhrases: phraseIds.map(id => ({
            id,
            deletedAt: 301,
            deletedBy: 'user-1',
            serverVersion: 1
          }))
        }
      })
    )
  }
  return {
    repository,
    settingsPort,
    service: createCommunicationCloudSyncService({
      repository,
      settingsPort
    })
  }
}

describe('communicationCloudSync', () => {
  const capacityPhrases = (count: number) => Array.from({ length: count }, (_, index) => ({
    id: `capacity-${index}`, sentence: `合成容量${index}`, output: [], usageCount: 0,
    createdAt: 100 + index, lastUsedAt: 100 + index, updatedAt: 100 + index
  }))

  test.each([99, 100])('uploads all %i local phrases and retains them', async count => {
    const harness = createHarness()
    harness.repository.overwriteCommunicationSavedPhrases(capacityPhrases(count))
    expect((await harness.service.upload('token')).ok).toBe(true)
    expect(harness.settingsPort.syncCommunicationSavedPhrases.mock.calls[0][1]).toHaveLength(count)
    expect(harness.repository.loadCommunicationSavedPhrases()).toHaveLength(count)
  })

  test('101 existing phrases stop upload before requests and preserve pending deletion', async () => {
    const harness = createHarness()
    const local = capacityPhrases(101)
    harness.repository.overwriteCommunicationSavedPhrases(local)
    const pending = [{ id: 'old-deleted', pending: true, deletedAt: 500 }]
    harness.repository.overwriteCommunicationSavedPhraseTombstones(pending)
    harness.repository.overwriteCommunicationSavedPhrases.mockClear()
    harness.repository.overwriteCommunicationSavedPhraseTombstones.mockClear()
    const result = await harness.service.upload('token')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/100|容量/)
    for (const request of Object.values(harness.settingsPort)) expect(request).not.toHaveBeenCalled()
    expect(harness.repository.loadCommunicationSavedPhrases()).toEqual(local)
    expect(harness.repository.loadCommunicationSavedPhraseTombstones()).toEqual(pending)
    expect(harness.repository.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled()
    expect(harness.repository.overwriteCommunicationSavedPhraseTombstones).not.toHaveBeenCalled()
  })

  test('99 plus 2 merged remote entries reject overwrite and safely retry after capacity is freed', async () => {
    const harness = createHarness()
    const local = capacityPhrases(99)
    const remote = capacityPhrases(101).slice(99)
    harness.repository.overwriteCommunicationSavedPhrases(local)
    harness.repository.overwriteCommunicationSavedPhrases.mockClear()
    harness.settingsPort.syncCommunicationSavedPhrases.mockImplementation(async () => ({
      ok: true, message: 'ok', value: { phrases: remote, deletedPhrases: [], deletedPhraseIds: [], acceptedCount: 99, conflictCount: 0, conflictedPhraseIds: [] }
    }))
    const result = await harness.service.upload('token')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/100|容量/)
    expect(harness.repository.loadCommunicationSavedPhrases()).toEqual(local)
    expect(harness.repository.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled()
    expect(harness.repository.overwriteCommunicationSavedPhraseTombstones).not.toHaveBeenCalled()
    expect(harness.settingsPort.updateSettings).not.toHaveBeenCalled()
    harness.repository.overwriteCommunicationSavedPhrases(local.slice(1))
    expect((await harness.service.upload('token')).ok).toBe(true)
    expect(harness.repository.loadCommunicationSavedPhrases()).toHaveLength(100)
  })

  test('verified repository write failure preserves all 99 phrases and pending deletions for retry', async () => {
    const harness = createHarness()
    const pending = [{ id: 'old-deleted', deletedAt: 500, pending: true, serverVersion: 0 }]
    const values = new Map([
      [COMMUNICATION_STORAGE_KEYS.savedPhrases, JSON.stringify(capacityPhrases(99))],
      [COMMUNICATION_STORAGE_KEYS.savedPhraseTombstones, JSON.stringify(pending)]
    ])
    let fail = false
    const repository = createCommunicationRepository({ storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (!fail) values.set(key, value) }
    }, now: () => 1000 })
    const service = createCommunicationCloudSyncService({ repository, settingsPort: harness.settingsPort })
    harness.settingsPort.syncCommunicationSavedPhrases.mockImplementation(async () => ({
      ok: true, message: 'ok', value: { phrases: capacityPhrases(100), deletedPhrases: [], deletedPhraseIds: [], acceptedCount: 99, conflictCount: 0, conflictedPhraseIds: [] }
    }))
    const before = repository.readFavoriteState()
    fail = true
    expect((await service.upload('token')).ok).toBe(false)
    expect(repository.readFavoriteState()).toEqual(before)
    fail = false
    expect((await service.upload('token')).ok).toBe(true)
    expect(repository.loadCommunicationSavedPhrases()).toHaveLength(100)
    expect(repository.loadCommunicationSavedPhraseTombstones()[0].pending).not.toBe(true)
    const success = repository.readFavoriteState()
    expect((await service.upload('token')).ok).toBe(true)
    expect(repository.readFavoriteState()).toEqual(success)
  })

  test('a new local favorite during synchronization invalidates the old snapshot instead of overwriting it', async () => {
    const harness = createHarness()
    const values = new Map([[COMMUNICATION_STORAGE_KEYS.savedPhrases, JSON.stringify(capacityPhrases(99))]])
    const repository = createCommunicationRepository({ storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) }
    }, now: () => 1000 })
    const service = createCommunicationCloudSyncService({ repository, settingsPort: harness.settingsPort })
    harness.settingsPort.syncCommunicationSavedPhrases.mockImplementation(async (_token, entries) => {
      repository.saveCommunicationPhrase({ id: 'during-sync', sentence: '同步期间新合成句', output: [], createdAt: 1000 })
      return { ok: true, message: 'ok', value: { phrases: entries, deletedPhrases: [], deletedPhraseIds: [], acceptedCount: 99, conflictCount: 0, conflictedPhraseIds: [] } }
    })
    expect((await service.upload('token')).ok).toBe(false)
    const saved = repository.loadCommunicationSavedPhrases()
    expect(saved).toHaveLength(100)
    expect(saved[0].id).toBe('during-sync')
    expect(harness.settingsPort.updateSettings).not.toHaveBeenCalled()
  })

  test('written favorite state with a lost receipt retries without duplicating or clearing newer content', async () => {
    const harness = createHarness()
    const values = new Map([[COMMUNICATION_STORAGE_KEYS.savedPhrases, JSON.stringify(capacityPhrases(99))]])
    let loseReceipt = false
    const repository = createCommunicationRepository({ storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
        if (loseReceipt) { loseReceipt = false; throw new Error('合成回执丢失') }
      }
    }, now: () => 1000 })
    const service = createCommunicationCloudSyncService({ repository, settingsPort: harness.settingsPort })
    repository.readFavoriteState()
    harness.settingsPort.syncCommunicationSavedPhrases.mockImplementation(async () => ({
      ok: true, message: 'ok', value: { phrases: capacityPhrases(100), deletedPhrases: [], deletedPhraseIds: [], acceptedCount: 100, conflictCount: 0, conflictedPhraseIds: [] }
    }))
    loseReceipt = true
    expect((await service.upload('token')).ok).toBe(false)
    const written = repository.readFavoriteState()
    expect(written.phrases).toHaveLength(100)
    expect((await service.upload('token')).ok).toBe(true)
    expect(repository.readFavoriteState()).toEqual(written)
  })

  test('merges legacy remote settings locally and writes both settings keys', async () => {
    const harness = createHarness()
    const result = await harness.service.sync('token')

    expect(result.ok).toBe(true)
    expect(result.message).toContain('云端新增 1 条')
    expect(result.message).toContain('本机上传 2 条')
    expect(result.message).toContain('处理 0 个设置冲突')
    expect(result.message).toContain('0 个确认接收记录冲突')
    expect(result.value?.savedPhrases.map(item => item.sentence)).toEqual([
      '我想喝水',
      '我要去厕所'
    ])
    expect(harness.settingsPort.updateSettings).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        communicationSupport: expect.any(Object),
        tuyujia: expect.any(Object)
      })
    )
    expect(
      harness.settingsPort.syncConfirmedReceiverRecords
    ).toHaveBeenCalledWith('token', [
      expect.objectContaining({
        id: 'receiver-local',
        recordStatus: 'confirmed'
      })
    ])
  })

  test('retires the anonymous identity only after a complete account sync', async () => {
    const harness = createHarness()
    const result = await harness.service.sync('token', {
      accountUserId: 'account-1'
    })

    expect(result.ok).toBe(true)
    expect(result.message).toContain('匿名身份已关联当前账号')
    expect(
      harness.repository.retireAnonymousUserIdentity
    ).toHaveBeenCalledWith('account-1')

    harness.repository.retireAnonymousUserIdentity.mockClear()
    harness.settingsPort.syncConfirmedReceiverRecords.mockResolvedValueOnce({
      ok: false,
      message: 'offline'
    } as never)
    await harness.service.sync('token', {
      accountUserId: 'account-1'
    })
    expect(
      harness.repository.retireAnonymousUserIdentity
    ).not.toHaveBeenCalled()
  })

  test('does not change local data when reading remote settings fails', async () => {
    const harness = createHarness()
    harness.settingsPort.getSettings.mockResolvedValueOnce({
      ok: false,
      message: 'offline'
    } as never)

    const result = await harness.service.sync('token')

    expect(result).toEqual({ ok: false, message: 'offline' })
    expect(harness.repository.overwriteCommunicationHistory).not.toHaveBeenCalled()
    expect(harness.settingsPort.updateSettings).not.toHaveBeenCalled()
  })

  test('uploads the current local value without requiring a preceding download', async () => {
    const harness = createHarness()
    const result = await harness.service.upload('token')

    expect(result.ok).toBe(true)
    expect(harness.settingsPort.getSettings).not.toHaveBeenCalled()
    expect(harness.settingsPort.updateSettings).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        communicationSupport: expect.objectContaining({
          savedPhrases: expect.any(Array),
          history: expect.any(Array)
        })
      })
    )
  })

  test('strips private device images from cloud settings without mutating local phrases', async () => {
    const harness = createHarness()
    const localPhrase = harness.repository
      .loadCommunicationSavedPhrases()[0] as any
    localPhrase.sentence = '我要找妈妈'
    localPhrase.output = [{
      id: 'device_private_missing_family-photo',
      label: '妈妈',
      image: 'wxfile://usr/family-photo.png',
      boardId: 'device-private-pictograms',
      source: 'user',
      attribution: {
        provider: 'device-private',
        originalId: 'family-photo',
        name: '当前设备私有图片',
        license: '用户提供，仅限本机使用',
        sourceUrl: 'device-private://missing-token/family-photo'
      }
    }]

    const result = await harness.service.upload('token')
    const patch = harness.settingsPort.updateSettings.mock.calls[0][1] as any
    const serialized = JSON.stringify(patch)

    expect(result.ok).toBe(true)
    expect(
      patch.communicationSupport.savedPhrases[0].output
    ).toEqual([{ id: '', label: '妈妈' }])
    expect(serialized).not.toContain('device-private')
    expect(serialized).not.toContain('wxfile://')
    expect(serialized).not.toContain('family-photo')
    expect(localPhrase.output[0].image).toBe(
      'wxfile://usr/family-photo.png'
    )
    expect(localPhrase.output[0].attribution.provider).toBe(
      'device-private'
    )
  })

  test('sanitizes private image references already present in remote settings', async () => {
    const harness = createHarness()
    harness.settingsPort.getSettings.mockResolvedValueOnce({
      ok: true,
      message: 'ok',
      value: {
        communicationSupport: {
          savedPhrases: [{
            id: 'remote-private',
            sentence: '我要找妈妈',
            output: [{
              id: 'device_private_missing_family-photo',
              label: '妈妈',
              image: 'wxfile://usr/family-photo.png',
              boardId: 'device-private-pictograms',
              source: 'user',
              attribution: {
                provider: 'device-private',
                originalId: 'family-photo',
                name: '当前设备私有图片',
                license: '用户提供，仅限本机使用',
                sourceUrl:
                  'device-private://missing-token/family-photo'
              }
            }],
            usageCount: 0,
            createdAt: 200,
            lastUsedAt: 200,
            updatedAt: 200
          }],
          history: []
        }
      }
    } as never)

    const result = await harness.service.sync('token')
    const localSerialized = JSON.stringify(result.value)
    const uploadedSerialized = JSON.stringify(
      harness.settingsPort.updateSettings.mock.calls[0][1]
    )

    expect(result.ok).toBe(true)
    expect(
      result.value?.savedPhrases.find(
        item => item.sentence === '我要找妈妈'
      )?.output
    ).toEqual([{ id: '', label: '妈妈' }])
    expect(localSerialized).not.toContain('device-private')
    expect(localSerialized).not.toContain('family-photo')
    expect(uploadedSerialized).not.toContain('device-private')
    expect(uploadedSerialized).not.toContain('family-photo')
  })

  test('keeps local data and reports a partial result when receiver sync fails', async () => {
    const harness = createHarness()
    harness.settingsPort.syncConfirmedReceiverRecords.mockResolvedValueOnce({
      ok: false,
      message: 'offline'
    } as never)

    const result = await harness.service.upload('token')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('仍留在本机')
    expect(result.value?.savedPhrases).toHaveLength(1)
  })

  test('shows version conflicts and keeps the server-confirmed record', async () => {
    const harness = createHarness()
    harness.settingsPort.syncConfirmedReceiverRecords.mockResolvedValueOnce({
      ok: true,
      message: 'conflict',
      value: {
        acceptedCount: 0,
        conflictCount: 1,
        conflictedRecordIds: ['receiver-local'],
        records: [{
          id: 'receiver-local',
          sessionId: 'session-local',
          patientId: 'patient-local',
          workspaceId: 'workspace-local',
          direction: 'receive',
          recordStatus: 'confirmed',
          inputText: '服务端已确认内容',
          labels: ['确认'],
          createdAt: 150,
          updatedAt: 150,
          confirmedAt: 150,
          serverVersion: 2,
          conflicted: true
        }],
        deletedRecordIds: [],
        deletedRecords: []
      }
    } as never)

    const result = await harness.service.sync('token')

    expect(result.ok).toBe(true)
    expect(result.message).toContain(
      '1 个确认接收记录冲突保留服务端内容'
    )
    expect(
      harness.repository.loadReceiverRecords()[0]
    ).toEqual(expect.objectContaining({
      inputText: '服务端已确认内容',
      serverVersion: 2,
      conflicted: true
    }))
  })

  test('applies receiver deletion locally after the server creates tombstones', async () => {
    const harness = createHarness()
    const result = await harness.service.deleteReceiverRecords(
      'token',
      ['receiver-local']
    )

    expect(result.ok).toBe(true)
    expect(
      harness.settingsPort.deleteConfirmedReceiverRecords
    ).toHaveBeenCalledWith(
      'token',
      ['receiver-local'],
      {}
    )
    expect(
      harness.repository.overwriteReceiverRecords
    ).toHaveBeenCalledWith([])
  })

  test('flushes pending saved phrase tombstones before uploading active phrases', async () => {
    const harness = createHarness()
    harness.repository.deleteCommunicationSavedPhrase('phrase-local')

    const result = await harness.service.upload('token')

    expect(result.ok).toBe(true)
    expect(
      harness.settingsPort.deleteCommunicationSavedPhrases
    ).toHaveBeenCalledWith('token', ['phrase-local'])
    expect(
      harness.settingsPort.syncCommunicationSavedPhrases
    ).toHaveBeenCalledWith('token', [])
    expect(
      harness.repository.loadCommunicationSavedPhrases()
    ).toEqual([])
    expect(
      harness.repository.loadCommunicationSavedPhraseTombstones()
    ).toEqual([
      expect.objectContaining({
        id: 'phrase-local',
        serverVersion: 1
      })
    ])
    expect(
      harness.repository.loadCommunicationSavedPhraseTombstones()[0]
        .pending
    ).not.toBe(true)
  })

  test('shows saved phrase version conflicts and keeps the server version', async () => {
    const harness = createHarness()
    harness.settingsPort.syncCommunicationSavedPhrases
      .mockResolvedValueOnce({
        ok: true,
        message: 'conflict',
        value: {
          acceptedCount: 0,
          conflictCount: 1,
          conflictedPhraseIds: ['phrase-local'],
          phrases: [{
            ...harness.repository.loadCommunicationSavedPhrases()[0],
            sentence: '服务端常用语版本',
            updatedAt: 200,
            serverVersion: 2,
            conflicted: true
          }],
          deletedPhraseIds: [],
          deletedPhrases: []
        }
      } as never)

    const result = await harness.service.sync('token')

    expect(result.ok).toBe(true)
    expect(result.message).toContain(
      '1 个常用语版本冲突仍可核对'
    )
    expect(
      harness.repository.loadCommunicationSavedPhrases().find(
        item => item.id === 'phrase-local'
      )
    ).toEqual(expect.objectContaining({
      sentence: '服务端常用语版本',
      serverVersion: 2,
      conflicted: true
    }))
  })
})
