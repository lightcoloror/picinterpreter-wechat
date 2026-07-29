import { describe, expect, test } from 'vitest'
import { COMMUNICATION_REPOSITORY_SCHEMA_VERSION } from '@cboard-communication-core/repository'

import { createWechatCommunicationRepository } from './communicationRepository'

describe('WeChat communication repository migration', () => {
  test('upgrades an unversioned WeChat snapshot and remains idempotent', () => {
    const values = new Map<string, unknown>([
      [
        'cboard_tuyujia_saved_phrases',
        [
          {
            sentence: '旧常用语',
            output: [{ id: 'legacy-tile', label: '旧图' }],
            createdAt: 10
          }
        ]
      ],
      [
        'cboard_communication_receiver_records',
        [
          {
            id: 'receiver-old-1',
            sessionId: 'session-old-1',
            patientId: 'patient-old',
            workspaceId: 'workspace-old',
            direction: 'receive',
            inputText: '想喝水',
            labels: ['水'],
            recordStatus: 'draft',
            createdAt: 20,
            updatedAt: 20
          }
        ]
      ],
      ['cboard_communication_patient_id', 'patient-old'],
      ['cboard_communication_workspace_id', 'workspace-old']
    ])
    let writeCount = 0
    const wechatApi = {
      getStorageSync: (key: string) => values.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => {
        writeCount += 1
        values.set(key, value)
      },
      removeStorageSync: (key: string) => values.delete(key)
    }
    const repository = createWechatCommunicationRepository(wechatApi)

    expect(repository.loadCommunicationSavedPhrases()[0].sentence).toBe(
      '旧常用语'
    )
    expect(repository.loadReceiverRecords()).toEqual([
      expect.objectContaining({
        id: 'receiver-old-1',
        recordStatus: 'draft'
      })
    ])
    expect(repository.loadCommunicationIdentity()).toEqual({
      patientId: 'patient-old',
      workspaceId: 'workspace-old'
    })
    expect(
      JSON.parse(
        String(values.get('cboard_communication_repository_schema'))
      )
    ).toEqual(
      expect.objectContaining({
        schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION,
        migratedAt: expect.any(Number)
      })
    )
    expect(
      JSON.parse(String(values.get('cboard_communication_saved_phrases')))
    ).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^phrase_/),
        sentence: '旧常用语',
        usageCount: 0,
        lastUsedAt: 10
      })
    ])

    const migratedWriteCount = writeCount
    const migratedSnapshot = new Map(values)
    createWechatCommunicationRepository(wechatApi)

    expect(writeCount).toBe(migratedWriteCount)
    expect(new Map(values)).toEqual(migratedSnapshot)
  })
})
