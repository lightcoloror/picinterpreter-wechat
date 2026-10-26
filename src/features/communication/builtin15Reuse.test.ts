import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import fixture from '@cboard-communication-core/fixtures/builtin15Reuse.json'
import careActions from '@cboard-communication-core/fixtures/careActionReuse.json'
import hygieneObjects from '@cboard-communication-core/fixtures/hygieneObjectReuse.json'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'
import { findSafeLocalMissingTokenResolutions, applyMissingTokenResolutions } from '@cboard-communication-core/missingTokens'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { runReceiverSession, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

const cases = [...fixture.cards,...careActions.cards,...hygieneObjects.cards].flatMap(card => card.tokens.map(token => ({ token, ...card })))

test.each(cases)('matches and restores the packaged picture offline: $token', ({ token, id, label }) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
      const state = runReceiverSession(token, DEFAULT_BOARD_FIXTURES)
      expect(state.reviewItems.map(item => item.token)).toEqual([token])
      const tile = state.reviewItems[0].tile!
      expect(tile.id).toBe(id)
      expect(tile.displayLabel).toBe(label)
      expect(state.outputPreview[0].vocalization).toBe(token)
      const record = JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(state)))
      const restored = restoreReceiverWorkspaceFromRecord(record, DEFAULT_BOARD_FIXTURES)!
      expect(restored.session.reviewItems[0].tile?.id).toBe(id)
      expect(restored.session.outputPreview[0].vocalization).toBe(token)
      const image = String(tile.tile.image)
      expect(image).toMatch(/^\/assets\/cboard-default\/.+\.png$/)
      const bytes = fs.readFileSync(path.resolve(process.cwd(), 'src' + image))
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor) }
})

test.each(cases)('resolves an old missing record and reuses it after adapter restart: $token', ({ token, id }) => {
  const values = new Map<string, unknown>()
  const storage = {
    getStorageSync: (key: string) => values.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => values.set(key, JSON.parse(JSON.stringify(value))),
    removeStorageSync: (key: string) => values.delete(key)
  }
  const repository = createWechatCommunicationRepository(storage)
  repository.recordMissingTokens({ tokens: [token], rawText: token, scene: 'receiver' })
  const catalog = buildCommunicationTileCatalog(DEFAULT_BOARD_FIXTURES)
  const [resolution] = findSafeLocalMissingTokenResolutions(repository.loadMissingTokens(), catalog)
  expect(resolution.resolvedPictogramId).toBe(id)
  repository.reviewMissingToken(resolution.recordId, { ...resolution, status: 'resolved' })
  const restarted = createWechatCommunicationRepository(storage)
  const [item] = applyMissingTokenResolutions([{ token, tile: null }], restarted.loadMissingTokens(), catalog)
  expect(item.tile?.id).toBe(id)
  expect(item.tile?.tile.image).toMatch(/^\/assets\/cboard-default\//)
})
