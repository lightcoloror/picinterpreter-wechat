import { beforeEach, expect, test, vi } from 'vitest'
import { createBoardDTO, type BoardDTO } from '@cboard-communication-core/dto'
import { clearSavedPhraseUndoSession } from '@cboard-communication-core/savedPhraseUse'

const h = vi.hoisted(() => ({
  epoch: 0, scope: 'communication-v2:synthetic-account:family:patient:',
  identity: { workspaceId: 'synthetic-family', patientId: 'synthetic-patient' },
  editable: true, locked: false, boards: [] as BoardDTO[], saves: 0
}))
vi.mock('@tarojs/taro', () => ({ default: { getStorageSync: () => h.locked } }))
vi.mock('@cboard-communication-core/imageOperationEpoch', () => ({ currentImageOperationEpoch: () => h.epoch }))
vi.mock('./taroCommunicationRepository', () => ({ createTaroCommunicationRepository: () => ({ loadCommunicationIdentity: () => h.identity }) }))
vi.mock('./taroCareContext', () => ({
  canEditCareLibrary: () => h.editable,
  careScopedKey: (key: string) => h.scope + key,
  currentCareContext: () => ({ accountId: 'offline', selection: { locked: h.locked } })
}))
vi.mock('./taroPictureLibraryStore', () => ({ taroPictureLibraryStore: {
  load: () => JSON.parse(JSON.stringify(h.boards)),
  save: (boards: BoardDTO[]) => { h.saves++; h.boards = JSON.parse(JSON.stringify(boards)); return boards }
} }))

import { currentGalleryUndoScope, taroGalleryTileUndo } from './taroGalleryTileUndo'
beforeEach(() => {
  h.epoch = 0; h.scope = 'communication-v2:synthetic-account:family:patient:'
  h.identity = { workspaceId: 'synthetic-family', patientId: 'synthetic-patient' }
  h.editable = true; h.locked = false; h.saves = 0
  h.boards = [createBoardDTO({ id: 'device_private_board_synthetic', tiles: [{ id: 'synthetic-person', label: '合成人物', image: 'wxfile://usr/synthetic.png' }] })]
  taroGalleryTileUndo.clear()
})

test('scope includes privacy generation, account/family/profile key, patient/workspace and permission', () => {
  const initial = currentGalleryUndoScope()
  for (const change of [() => { h.epoch++ }, () => { h.scope += 'other:' },
    () => { h.identity.workspaceId += '-other' }, () => { h.identity.patientId += '-other' },
    () => { h.editable = false }]) {
    const before = currentGalleryUndoScope(); change(); expect(currentGalleryUndoScope()).not.toBe(before)
  }
  expect(currentGalleryUndoScope()).not.toBe(initial)
})

test('existing privacy/saved-phrase cleanup immediately clears the singleton even across A-B-A', async () => {
  await taroGalleryTileUndo.delete(h.boards[0].id, 'synthetic-person')
  expect(taroGalleryTileUndo.state().count).toBe(1)
  const listener = vi.fn(); const stop = taroGalleryTileUndo.subscribe(listener)
  const originalScope = h.scope
  h.scope = 'synthetic-other-account'
  clearSavedPhraseUndoSession()
  h.scope = originalScope
  clearSavedPhraseUndoSession()
  expect(listener).toHaveBeenCalled()
  expect(listener.mock.calls[listener.mock.calls.length - 1]?.[0].count).toBe(0)
  expect(taroGalleryTileUndo.state().count).toBe(0)
  stop()
})

test('locked offline profiles cannot edit despite the general offline permission fallback', async () => {
  h.locked = true
  await expect(taroGalleryTileUndo.delete(h.boards[0].id, 'synthetic-person')).rejects.toThrow()
  expect(h.saves).toBe(0)
})

test('same-scope mount cleanup preserves gallery undo while explicit privacy cleanup clears it', async () => {
  await taroGalleryTileUndo.delete(h.boards[0].id, 'synthetic-person')
  const operationId = taroGalleryTileUndo.state().operationId
  clearSavedPhraseUndoSession({ preserveGallery: true })
  expect(taroGalleryTileUndo.state()).toMatchObject({ count: 1, operationId })
  clearSavedPhraseUndoSession()
  expect(taroGalleryTileUndo.state().count).toBe(0)
})

test('preserve-gallery cleanup still immediately clears changed scope before an A-B-A return', async () => {
  await taroGalleryTileUndo.delete(h.boards[0].id, 'synthetic-person')
  const originalScope = h.scope
  const listener = vi.fn(); const stop = taroGalleryTileUndo.subscribe(listener)
  h.scope = 'synthetic-other-account'
  clearSavedPhraseUndoSession({ preserveGallery: true })
  expect(listener.mock.calls[listener.mock.calls.length - 1]?.[0].count).toBe(0)
  h.scope = originalScope
  clearSavedPhraseUndoSession({ preserveGallery: true })
  expect(taroGalleryTileUndo.state().count).toBe(0)
  stop()
})

test('existing editable custom cards on a built-in board can still be deleted and restored', async () => {
  h.boards[0].id = 'builtin-synthetic'
  const before = JSON.parse(JSON.stringify(h.boards[0]))
  await taroGalleryTileUndo.delete(h.boards[0].id, 'synthetic-person')
  await taroGalleryTileUndo.undo(taroGalleryTileUndo.state().operationId!)
  expect(h.saves).toBe(2)
  expect(h.boards[0]).toEqual(before)
})
