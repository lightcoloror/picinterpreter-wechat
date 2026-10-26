import { describe, expect, test } from 'vitest'
import { buildWorkspaceCorrectionMemory } from '@cboard-communication-core/correctionMemory'
import { RECEIVER_PATIENT_FEEDBACK } from '@cboard-communication-core/receiverPatientFeedback'
import { receiverDraftContentSignature } from '@cboard-communication-core/receiverDraftPersistence'

import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import {
  buildConfirmedReceiverHistory,
  createReceiverWorkspaceFromRecognizedText,
  createReceiverWorkspaceResumeState,
  insertReceiverItem,
  deleteReceiverItem,
  formatReceiverSegmentation,
  getReceiverReplacementCatalog,
  moveReceiverItem,
  parseReceiverSegmentationInput,
  refreshReceiverMissingItems,
  replaceReceiverItem,
  retainReceiverItemAsText,
  restoreReceiverWorkspaceFromRecord,
  resumeReceiverWorkspaceAfterDisplay,
  runReceiverSession
} from './receiverSession'

function createReviewIdFactory() {
  let index = 0
  return () => `review-${index++}`
}

describe('WeChat receiver session', () => {
  test('restored retained text and action snapshots still describe the saved draft', () => {
    let state = runReceiverSession('我今晚不回家吃饭，明早七点半出门。', DEFAULT_BOARD_FIXTURES)
    state.reviewItems.filter(item => !item.tile).forEach(item => { state = retainReceiverItemAsText(state, item.id) })
    const entry = { ...buildConfirmedReceiverHistory(state)!, id: 'synthetic-receiver', recordStatus: 'draft' as const }
    const restored = restoreReceiverWorkspaceFromRecord(entry, DEFAULT_BOARD_FIXTURES)!
    expect(JSON.parse(receiverDraftContentSignature(buildConfirmedReceiverHistory(restored.session)))).toEqual(JSON.parse(receiverDraftContentSignature(entry)))
  })
  test.each([
    ['你是想喝水吗？', ['你', '是', '想', '喝', '水', '吗', '？']],
    ['今天吃了三次药', ['今天', '吃', '了', '三', '次', '药']],
    ['后天早上八点再来', ['后天', '早上', '八点', '再', '来']],
    ['我想换一个枕头', ['我', '想', '换', '一', '个', '枕头']],
    ['二十三次', ['二十三', '次']],
    ['一个人', ['一个人']],
    ['我想用助行器', ['我', '想', '用', '助行器']],
    ['只喝两口水', ['只', '喝', '两', '口', '水']],
    ['你是不是想吐？', ['你', '是不是', '想吐', '？']],
    ['请找眼镜盒，不是眼镜', ['请', '找', '眼镜盒', '，', '不是', '眼镜']],
    ['水温是37.5℃', ['水温', '是', '37.5', '℃']]
  ])('retains repaired boundaries through offline confirmation and restore: %s', (raw, expected) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
    try {
      for (const fallback of [false, true]) {
        if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
        const state = runReceiverSession(raw as string, DEFAULT_BOARD_FIXTURES, { createId: createReviewIdFactory() })
        expect(state.reviewItems.map(item => item.token)).toEqual(expected)
        let next = state
        state.reviewItems.filter(item => !item.tile).forEach(item => { next = retainReceiverItemAsText(next, item.id) })
        const history = buildConfirmedReceiverHistory(next)!
        const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'common-sentence-record', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
        expect(restored.session.reviewItems.map(item => item.token)).toEqual(expected)
        expect(restored.session.reviewItems.map(item => item.token).join('')).toBe(raw)
      }
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor)
      else delete (Intl as unknown as Record<string, unknown>).Segmenter
    }
  })

  test('keeps standalone negation and a whole eating-meal action through confirmation and restore', () => {
    const raw = '我今晚不回家吃饭'
    const expected = ['我', '今晚', '不', '回家', '吃饭']
    const state = runReceiverSession(raw, DEFAULT_BOARD_FIXTURES, { createId: createReviewIdFactory() })
    expect(state.reviewItems.map(item => item.token)).toEqual(expected)
    expect(state.reviewItems.find(item => item.token === '吃饭')!.tile).toBeNull()
    let next = state
    state.reviewItems.filter(item => !item.tile).forEach(item => { next = retainReceiverItemAsText(next, item.id) })
    const history = buildConfirmedReceiverHistory(next)!
    expect(history.output!.map(item => item.vocalization).join('')).toBe(raw)
    const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'meal-record', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
    expect(restored.session.reviewItems.map(item => item.token)).toEqual(expected)
    expect(restored.segmentationDraft).toBe('我 / 今晚 / 不 / 回家 / 吃饭')
  })

  test('keeps the pain location through explicit text fallback and session restore', () => {
    const raw = '我背疼'
    const state = runReceiverSession(raw, DEFAULT_BOARD_FIXTURES, { createId: createReviewIdFactory() })
    const pain = state.reviewItems.find(item => item.token === '背疼')!
    expect(pain).toBeDefined()
    expect(pain.tile).toBeNull()
    let next = state
    state.reviewItems.filter(item => !item.tile).forEach(item => { next = retainReceiverItemAsText(next, item.id) })
    const history = buildConfirmedReceiverHistory(next)!
    const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'pain-record', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
    expect(restored.session.outputPreview.map(item => item.vocalization).join('')).toBe(raw)
    expect(restored.session.reviewItems.find(item => item.token === '背疼')!.tile?.textOnly).toBe(true)
  })

  test('preserves double-negation speech through text fallback and session restore with default boards', () => {
    const raw = '我不是不想吃饭'
    const state = runReceiverSession(raw, DEFAULT_BOARD_FIXTURES, { createId: createReviewIdFactory() })
    expect(state.reviewItems.map(item => item.token)).toEqual(['我', '不是', '不', '想', '吃饭'])
    expect(state.reviewItems.find(item => item.token === '不是')!.tile).toBeNull()
    let next = state
    state.reviewItems.filter(item => !item.tile).forEach(item => { next = retainReceiverItemAsText(next, item.id) })
    const history = buildConfirmedReceiverHistory(next)!
    expect(history.output!.map(item => item.vocalization).join('')).toBe(raw)
    const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'negative-record', recordStatus: 'confirmed' }, DEFAULT_BOARD_FIXTURES)!
    expect(restored.session.outputPreview.map(item => item.vocalization).join('')).toBe(raw)
  })

  test('retains missing negatives only after an explicit choice and restores literal text on another session', () => {
    const state = runReceiverSession(' 不要水吗？ ', [], { createId: createReviewIdFactory() })
    expect(state.reviewItems.map(item => item.token).join('')).toBe(state.inputText)
    expect(state.quality.missingCount).toBeGreaterThan(0)
    let next = state
    state.reviewItems.filter(item => !item.tile).forEach(item => { next = retainReceiverItemAsText(next, item.id) })
    expect(next.quality.missingCount).toBe(0)
    expect(state.quality.missingCount).toBeGreaterThan(0)
    const history = buildConfirmedReceiverHistory(next)!
    const restored = restoreReceiverWorkspaceFromRecord({ ...JSON.parse(JSON.stringify(history)), id: 'record', recordStatus: 'confirmed' }, [])!
    expect(restored.session.outputPreview.map(item => item.label).join('')).toBe('不要水吗？')
    expect(restored.session.reviewItems.every(item => item.tile?.textOnly)).toBe(true)
    expect(parseReceiverSegmentationInput(restored.segmentationDraft)).toEqual(restored.session.segments)
  })
  test('fills OCR text as an editable unmatched draft without auto matching', () => {
    const state = createReceiverWorkspaceFromRecognizedText(
      '  我想\n喝水  '
    )

    expect(state.session.inputText).toBe('我想 喝水')
    expect(state.session.matched).toBe(false)
    expect(state.session.reviewItems).toEqual([])
    expect(state.session.outputPreview).toEqual([])
    expect(state.segmentationDraft).toBe('')
    expect(state.notice).toContain('人工修改')
  })

  test('restores the same review state after patient feedback', () => {
    const session = runReceiverSession('想喝水', DEFAULT_BOARD_FIXTURES, {
      createId: createReviewIdFactory()
    })
    const snapshot = createReceiverWorkspaceResumeState({
      session,
      segmentationDraft: '想 / 喝 / 水',
      activeDraft: {
        id: 'receiver-confirmed',
        recordStatus: 'confirmed'
      } as any,
      learnFromCorrections: false
    })
    const resumed = resumeReceiverWorkspaceAfterDisplay(snapshot, {
      feedback: RECEIVER_PATIENT_FEEDBACK.notUnderstood,
      saved: true
    })

    expect(resumed.session.inputText).toBe('想喝水')
    expect(resumed.session.reviewItems.map(item => item.token)).toEqual([
      '想',
      '喝',
      '水'
    ])
    expect(resumed.session.outputPreview).toHaveLength(3)
    expect(resumed.segmentationDraft).toBe('想 / 喝 / 水')
    expect(resumed.activeDraft?.id).toBe('receiver-confirmed')
    expect(resumed.learnFromCorrections).toBe(false)
    expect(resumed.notice).toContain('请修改文字、分词或图片')
    expect(resumed.session).not.toBe(session)
  })

  test('restores a persisted draft as an editable receiver workspace', () => {
    const session = runReceiverSession('想喝水', DEFAULT_BOARD_FIXTURES, {
      createId: createReviewIdFactory()
    })
    const history = buildConfirmedReceiverHistory(session)

    expect(history).not.toBeNull()
    const restored = restoreReceiverWorkspaceFromRecord(
      {
        ...history!,
        id: 'receiver-draft',
        sessionId: 'conversation-1',
        patientId: 'patient-1',
        workspaceId: 'workspace-1',
        recordStatus: 'draft',
        createdAt: 1,
        updatedAt: 2
      },
      DEFAULT_BOARD_FIXTURES,
      { learnFromCorrections: false }
    )

    expect(restored).not.toBeNull()
    expect(restored?.session.inputText).toBe('想喝水')
    expect(restored?.session.reviewItems.map(item => item.token)).toEqual([
      '想',
      '喝',
      '水'
    ])
    expect(restored?.session.outputPreview).toHaveLength(3)
    expect(restored?.segmentationDraft).toBe('想 / 喝 / 水')
    expect(restored?.activeDraft?.id).toBe('receiver-draft')
    expect(restored?.learnFromCorrections).toBe(false)
    expect(restored?.notice).toBe('已恢复上次未完成的图片复核。')
  })

  test('turns caregiver text into an ordered CBoard image sequence', () => {
    const session = runReceiverSession('想喝水', DEFAULT_BOARD_FIXTURES, {
      createId: createReviewIdFactory()
    })

    expect(session.reviewItems.map(item => item.matchType)).toEqual([
      'synonym',
      'exact',
      'exact'
    ])
    expect(session.outputPreview.map(item => item.label)).toEqual([
      '想',
      '喝',
      '水'
    ])
    expect(session.quality).toEqual(
      expect.objectContaining({
        matchedCount: 3,
        totalCount: 3,
        needsReview: false
      })
    )
  })

  test('reuses migrated PicInterpreter spoken aliases in the WeChat pipeline', () => {
    const watchTv = runReceiverSession(
      '我想看个电视',
      DEFAULT_BOARD_FIXTURES,
      { createId: createReviewIdFactory() }
    )
    const fever = runReceiverSession('我体温高', DEFAULT_BOARD_FIXTURES, {
      createId: createReviewIdFactory()
    })

    expect(watchTv.reviewItems.map(item => item.token)).toEqual([
      '我',
      '想',
      '看个电视'
    ])
    expect(watchTv.outputPreview.map(item => item.label)).toEqual([
      '我',
      '想',
      '看个电视'
    ])
    expect(fever.reviewItems.map(item => item.token)).toEqual([
      '我',
      '体温高'
    ])
    expect(fever.reviewItems[1]).toEqual(
      expect.objectContaining({ tile: null, matchType: 'none' })
    )
  })

  test('reuses a learned replacement only through workspace correction memory', () => {
    const catalog = getReceiverReplacementCatalog(DEFAULT_BOARD_FIXTURES)
    const water = catalog.find(candidate => candidate.displayLabel === '水')
    const drink = catalog.find(candidate => candidate.displayLabel === '喝')
    expect(water).toBeDefined()
    expect(drink).toBeDefined()

    const correctionMemory = buildWorkspaceCorrectionMemory(
      [
        {
          id: 'correction-1',
          expressionId: 'receiver-1',
          sessionId: 'session-1',
          patientId: 'patient-1',
          workspaceId: 'workspace-1',
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
      ],
      { workspaceId: 'workspace-1', now: 10 }
    )
    const session = runReceiverSession('水', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['水'],
      correctionMemory,
      createId: createReviewIdFactory()
    })

    expect(session.reviewItems[0]).toEqual(
      expect.objectContaining({
        token: '水',
        matchType: 'manual',
        source: 'corrected',
        tile: expect.objectContaining({ id: drink!.id })
      })
    )
    expect(session.outputPreview[0].label).toBe('喝')
  })

  test('suppresses a learned deletion with the packaged CBoard fixtures', () => {
    const catalog = getReceiverReplacementCatalog(DEFAULT_BOARD_FIXTURES)
    const drink = catalog.find(candidate => candidate.displayLabel === '喝')
    expect(drink).toBeDefined()

    const correctionMemory = buildWorkspaceCorrectionMemory(
      [
        {
          id: 'correction-delete',
          expressionId: 'receiver-delete',
          sessionId: 'session-1',
          patientId: 'patient-1',
          workspaceId: 'workspace-1',
          userId: null,
          action: 'delete_pictogram',
          originalToken: '喝',
          normalizedToken: '',
          sequenceIndexBefore: 0,
          sequenceIndexAfter: null,
          pictogramIdBefore: drink!.id,
          pictogramIdAfter: null,
          pictogramIdsBefore: [drink!.id],
          pictogramIdsAfter: [],
          isUsedForLearning: true,
          createdAt: 10
        }
      ],
      { workspaceId: 'workspace-1', now: 10 }
    )
    const session = runReceiverSession('喝', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['喝'],
      correctionMemory,
      createId: createReviewIdFactory()
    })

    expect(session.reviewItems[0]).toEqual(
      expect.objectContaining({
        token: '喝',
        tile: null,
        matchType: 'none',
        source: 'corrected'
      })
    )
    expect(session.outputPreview).toEqual([])
    expect(session.quality.needsReview).toBe(true)
  })

  test('does not let an async auto resolution restore a deleted pictogram', () => {
    const catalog = getReceiverReplacementCatalog(DEFAULT_BOARD_FIXTURES)
    const drink = catalog.find(candidate => candidate.displayLabel === '喝')
    expect(drink).toBeDefined()

    const correctionMemory = buildWorkspaceCorrectionMemory(
      [
        {
          id: 'correction-delete-refresh',
          expressionId: 'receiver-delete-refresh',
          sessionId: 'session-1',
          patientId: 'patient-1',
          workspaceId: 'workspace-1',
          userId: null,
          action: 'delete_pictogram',
          originalToken: '喝',
          normalizedToken: '',
          sequenceIndexBefore: 0,
          sequenceIndexAfter: null,
          pictogramIdBefore: drink!.id,
          pictogramIdAfter: null,
          pictogramIdsBefore: [drink!.id],
          pictogramIdsAfter: [],
          isUsedForLearning: true,
          createdAt: 10
        }
      ],
      { workspaceId: 'workspace-1', now: 11 }
    )
    const initial = runReceiverSession('喝', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['喝'],
      correctionMemory,
      createId: createReviewIdFactory()
    })
    const createResolution = (reviewedByCaregiver: boolean, updatedAt: number) => ({
      id: 'missing-drink',
      normalizedToken: '喝',
      status: 'resolved',
      occurrenceCount: 1,
      scenes: ['receiver'],
      rawTextSamples: ['喝'],
      suggestedPictogramId: null,
      source: reviewedByCaregiver ? 'caregiver' : 'catalog-auto',
      resolvedPictogramId: drink!.id,
      reviewedByCaregiver,
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      createdAt: 9,
      updatedAt
    })
    const autoRefreshed = refreshReceiverMissingItems(
      initial,
      DEFAULT_BOARD_FIXTURES,
      [createResolution(false, 12)],
      correctionMemory
    )
    const caregiverRefreshed = refreshReceiverMissingItems(
      initial,
      DEFAULT_BOARD_FIXTURES,
      [createResolution(true, 12)],
      correctionMemory
    )

    expect(autoRefreshed).toBe(initial)
    expect(autoRefreshed.reviewItems[0].tile).toBeNull()
    expect(caregiverRefreshed.reviewItems[0].tile?.id).toBe(drink!.id)
  })

  test('uses calibrated pictures while preserving received high-risk care wording', () => {
    const session = runReceiverSession(
      '恶心护士手机',
      DEFAULT_BOARD_FIXTURES,
      {
        preSegmented: ['恶心', '护士', '手机'],
        createId: createReviewIdFactory()
      }
    )

    expect(session.outputPreview.map(item => item.label)).toEqual([
      '恶心',
      '护士',
      '手机'
    ])
    expect(session.outputPreview.every(item => Boolean(item.image))).toBe(true)
    expect(session.quality).toEqual(
      expect.objectContaining({
        matchedCount: 3,
        totalCount: 3,
        needsReview: false
      })
    )
  })

  test('matches natural tableware words to four visible packaged images', () => {
    const session = runReceiverSession(
      '叉子 刀 勺子 碗',
      DEFAULT_BOARD_FIXTURES,
      {
        createId: createReviewIdFactory()
      }
    )

    expect(session.segments).toEqual(['叉子', ' ', '刀', ' ', '勺子', ' ', '碗'])
    expect(session.segments.join('')).toBe(session.inputText)
    expect(session.outputPreview.map(item => item.label)).toEqual([
      '叉子',
      '刀',
      '勺子',
      '碗'
    ])
    expect(session.outputPreview.every(item => Boolean(item.image))).toBe(true)
    expect(session.quality).toEqual(
      expect.objectContaining({
        matchedCount: 7,
        totalCount: 7,
        needsReview: false
      })
    )
  })

  test('lets the caregiver edit and reapply the token sequence', () => {
    const segmentationText = '我 / 想 / 喝 / 水'
    const tokens = parseReceiverSegmentationInput(segmentationText)
    const session = runReceiverSession('我想喝水', DEFAULT_BOARD_FIXTURES, {
      preSegmented: tokens,
      createId: createReviewIdFactory()
    })

    expect(tokens).toEqual(['我', '想', '喝', '水'])
    expect(formatReceiverSegmentation(tokens)).toBe(segmentationText)
    expect(session.segments).toEqual(tokens)
    expect(session.reviewItems.map(item => item.token)).toEqual(tokens)
  })
  test('supports review ordering, deletion, and manual replacement', () => {
    const initial = runReceiverSession('水火星词', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['水', '火星词'],
      createId: createReviewIdFactory()
    })
    const moved = moveReceiverItem(initial, 'review-0', 1)
    const withoutWater = deleteReceiverItem(moved, 'review-0')
    const waterCandidate = getReceiverReplacementCatalog(
      DEFAULT_BOARD_FIXTURES
    ).find(candidate => candidate.displayLabel === '水')

    expect(moved.reviewItems.map(item => item.token)).toEqual(['火星词', '水'])
    expect(withoutWater.quality.missingCount).toBe(1)
    expect(waterCandidate).toBeDefined()

    const replaced = replaceReceiverItem(
      withoutWater,
      'review-1',
      waterCandidate!
    )
    const history = buildConfirmedReceiverHistory(replaced)

    expect(replaced.outputPreview.map(item => item.label)).toEqual(['水'])
    expect(replaced.quality.needsReview).toBe(false)
    expect(history).toEqual(
      expect.objectContaining({
        contractVersion: 2,
        direction: 'receive',
        inputText: '水火星词',
        labels: ['水'],
        pictogramSequence: [
          expect.objectContaining({
            originalToken: '火星词',
            matchType: 'manual',
            source: 'corrected',
            confidence: 1
          })
        ]
      })
    )
  })

  test('inserts a manually selected pictogram after the chosen item', () => {
    const initial = runReceiverSession('想水', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['想', '水'],
      createId: createReviewIdFactory()
    })
    const drinkCandidate = getReceiverReplacementCatalog(
      DEFAULT_BOARD_FIXTURES
    ).find(candidate => candidate.displayLabel === '喝')

    expect(drinkCandidate).toBeDefined()
    const inserted = insertReceiverItem(
      initial,
      'review-0',
      drinkCandidate!,
      'review-inserted'
    )
    const history = buildConfirmedReceiverHistory(inserted)

    expect(inserted.reviewItems.map(item => item.token)).toEqual([
      '想',
      '喝',
      '水'
    ])
    expect(inserted.reviewItems[1]).toEqual(
      expect.objectContaining({
        id: 'review-inserted',
        source: 'manual'
      })
    )
    expect(history?.pictogramSequence[1]).toEqual(
      expect.objectContaining({
        label: '喝',
        source: 'manual'
      })
    )
  })

  test('does not confirm an empty or entirely unmatched result', () => {
    const session = runReceiverSession('火星词', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['火星词'],
      createId: createReviewIdFactory()
    })

    expect(session.quality.needsReview).toBe(true)
    expect(session.outputPreview).toEqual([])
    expect(buildConfirmedReceiverHistory(session)).toBeNull()
  })

  test('reuses a caregiver resolution for the same missing token', () => {
    const session = runReceiverSession('火星词', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['火星词'],
      createId: createReviewIdFactory(),
      missingTokenRecords: [
        {
          id: 'missing-token-1',
          normalizedToken: '火星词',
          status: 'resolved',
          occurrenceCount: 2,
          scenes: ['receiver'],
          rawTextSamples: ['火星词'],
          suggestedPictogramId: null,
          source: 'caregiver',
          resolvedPictogramId: 'SystfA56X5KZ',
          reviewedByCaregiver: true,
          patientId: 'patient-local',
          workspaceId: 'workspace-local',
          createdAt: 1,
          updatedAt: 2
        }
      ]
    })

    expect(session.reviewItems).toEqual([
      expect.objectContaining({
        token: '火星词',
        matchType: 'manual',
        tile: expect.objectContaining({ displayLabel: '水' })
      })
    ])
    expect(session.quality.needsReview).toBe(false)
    expect(session.outputPreview.map(item => item.label)).toEqual(['水'])
  })

  test('applies an accepted online image without reverting caregiver edits', () => {
    const initial = runReceiverSession('火星词水', DEFAULT_BOARD_FIXTURES, {
      preSegmented: ['火星词', '水'],
      createId: createReviewIdFactory()
    })
    const drinkCandidate = getReceiverReplacementCatalog(
      DEFAULT_BOARD_FIXTURES
    ).find(candidate => candidate.displayLabel === '喝')
    const manuallyEdited = replaceReceiverItem(
      initial,
      'review-1',
      drinkCandidate!
    )
    const refreshed = refreshReceiverMissingItems(
      manuallyEdited,
      DEFAULT_BOARD_FIXTURES,
      [
        {
          id: 'missing-token-online',
          normalizedToken: '火星词',
          status: 'resolved',
          occurrenceCount: 1,
          scenes: ['receiver'],
          rawTextSamples: ['火星词水'],
          suggestedPictogramId: null,
          suggestedPictogram: null,
          source: 'online:arasaac',
          resolvedPictogramId: 'runtime:arasaac:123',
          resolvedPictogram: {
            id: 'runtime:arasaac:123',
            label: '火星',
            vocalization: '火星',
            image: 'wxfile://cached/mars.png',
            backgroundColor: '#ffffff',
            source: {
              provider: 'arasaac',
              originalId: '123',
              name: 'ARASAAC',
              license: 'CC BY-NC-SA 3.0',
              licenseUrl: 'https://arasaac.org/terms-of-use',
              author: 'ARASAAC',
              authorUrl: null,
              sourceUrl: 'https://arasaac.org/pictograms/123'
            }
          },
          reviewedByCaregiver: true,
          patientId: 'patient-local',
          workspaceId: 'workspace-local',
          createdAt: 1,
          updatedAt: 2
        }
      ]
    )

    expect(refreshed.reviewItems.map(item => item.matchType)).toEqual([
      'online',
      'manual'
    ])
    expect(refreshed.outputPreview.map(item => item.label)).toEqual([
      '火星词',
      '喝'
    ])
    expect(refreshed.reviewItems[1]).toBe(manuallyEdited.reviewItems[1])
    expect(refreshed.quality.needsReview).toBe(false)
  })
})
