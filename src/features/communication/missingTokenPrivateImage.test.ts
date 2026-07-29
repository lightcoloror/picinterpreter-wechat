import { describe, expect, test } from 'vitest'

import {
  applyMissingTokenResolutions
} from '@cboard-communication-core/missingTokens'
import type { MissingTokenRecord } from '@cboard-communication-core/repository'
import {
  buildDevicePrivateRuntimePictogram
} from '@cboard-communication-core/runtimePictogram'

describe('device-private missing-token integration', () => {
  test('reuses the CBoard runtime pictogram contract without an online dependency', () => {
    const pictogram = buildDevicePrivateRuntimePictogram({
      recordId: 'missing-private',
      label: '家里的药盒',
      image: 'wxfile://saved/familiar-medicine.jpg'
    })
    expect(pictogram).not.toBeNull()

    const record: MissingTokenRecord = {
      id: 'missing-private',
      normalizedToken: '家里的药盒',
      status: 'resolved',
      occurrenceCount: 1,
      scenes: ['receiver'],
      rawTextSamples: ['请拿家里的药盒'],
      suggestedPictogramId: null,
      suggestedPictogram: null,
      source: 'device-private',
      resolvedPictogramId: pictogram!.id,
      resolvedPictogram: pictogram,
      reviewedByCaregiver: true,
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      createdAt: 10,
      updatedAt: 20
    }

    expect(
      applyMissingTokenResolutions(
        [
          {
            id: 'review-private',
            token: '家里的药盒',
            tile: null,
            matchType: 'missing'
          }
        ],
        [record],
        []
      )
    ).toEqual([
      expect.objectContaining({
        matchType: 'manual',
        tile: expect.objectContaining({
          boardId: 'device-private-pictograms',
          tile: expect.objectContaining({
            image: 'wxfile://saved/familiar-medicine.jpg'
          })
        })
      })
    ])
  })
})
