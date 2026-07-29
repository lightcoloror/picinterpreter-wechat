import { describe, expect, test } from 'vitest'
import {
  buildCorrectionMemoryManagementRows,
  buildWorkspaceCorrectionMemory,
  disableWorkspaceCorrectionMemoryToken
} from '@cboard-communication-core/correctionMemory'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'

describe('WeChat correction memory management', () => {
  test('shows a packaged CBoard label and can stop consuming its audit row', () => {
    const catalog = buildCommunicationTileCatalog(DEFAULT_BOARD_FIXTURES)
    const water = catalog.find(candidate => candidate.displayLabel === '水')
    const drink = catalog.find(candidate => candidate.displayLabel === '喝')
    expect(water).toBeDefined()
    expect(drink).toBeDefined()
    const corrections = [
      {
        id: 'correction-water',
        expressionId: 'receiver-water',
        sessionId: 'session-water',
        patientId: 'patient-local',
        workspaceId: 'workspace-local',
        userId: null,
        action: 'replace_pictogram',
        originalToken: '水',
        normalizedToken: '水',
        sequenceIndexBefore: 0,
        sequenceIndexAfter: 0,
        pictogramIdBefore: water!.id,
        pictogramIdAfter: drink!.id,
        pictogramIdsBefore: [water!.id],
        pictogramIdsAfter: [drink!.id],
        isUsedForLearning: true,
        createdAt: 10
      }
    ]
    const memory = buildWorkspaceCorrectionMemory(corrections, {
      workspaceId: 'workspace-local',
      now: 11
    })
    const rows = buildCorrectionMemoryManagementRows(memory, catalog)
    const disabled = disableWorkspaceCorrectionMemoryToken(corrections, {
      workspaceId: 'workspace-local',
      token: '水'
    })
    const nextMemory = buildWorkspaceCorrectionMemory(disabled.items, {
      workspaceId: 'workspace-local',
      now: 12
    })

    expect(rows).toEqual([
      expect.objectContaining({
        token: '水',
        preferredLabel: '喝',
        frequencyCount: 1
      })
    ])
    expect(disabled.items[0]).toEqual(
      expect.objectContaining({
        id: 'correction-water',
        isUsedForLearning: false
      })
    )
    expect(nextMemory.rules).toEqual([])
  })
})
