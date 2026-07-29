import { describe, expect, test, vi } from 'vitest'

import { createCommunicationCloudSyncService } from './communicationCloudSync'

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
  test('merges legacy remote settings locally and writes both settings keys', async () => {
    const harness = createHarness()
    const result = await harness.service.sync('token')

    expect(result.ok).toBe(true)
    expect(result.message).toContain('云端新增 1 条')
    expect(result.message).toContain('本机上传 2 条')
    expect(result.message).toContain('处理 0 个设置冲突')
    expect(result.message).toContain('0 个确认接收记录冲突')
    expect(result.value?.savedPhrases.map(item => item.sentence)).toEqual([
      '我要去厕所',
      '我想喝水'
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
