import { expect, test, vi } from 'vitest'
import { createCareBuiltinImages } from '@cboard-communication-core/careBuiltinImages'
import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { loadCommunicationBoards } from './taroCommunicationBoards'
import { careBuiltinImages } from './taroCareBuiltinImages'
import webBoards from '../../../cboard/src/api/boards.json'
import builtin15 from '@cboard-communication-core/fixtures/builtin15Reuse.json'
import { runReceiverSession } from '../features/communication/receiverSession'

const h = vi.hoisted(() => ({ locked: false, boards: [] as any[], context: { profileId: 'patient-a' } as { profileId: string } | null, save: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: { getStorageSync: () => h.locked } }))
vi.mock('./taroCareContext', () => ({ currentCareContext: () => h.context, careScopedKey: (key: string) => key }))
vi.mock('./taroPictureLibraryStore', () => ({ taroPictureLibraryStore: { load: () => h.boards, save: h.save } }))

test('new patient can use packaged adult-care symbols without saving them into the patient library', () => {
  h.boards = []
  h.locked = false
  const result = loadCommunicationBoards()
  expect(result).toBe(DEFAULT_BOARD_FIXTURES)
  const root = result.find(board => board.id === 'root')!
  expect(root.tiles.some(tile => tile.label === '我要喝水')).toBe(true)
  for (const board of result) for (const tile of board.tiles) {
    if (tile.image) expect(careBuiltinImages.resolve(careBuiltinImages.reference(tile.image)!)).toBe(tile.image)
  }
  expect(h.boards).toEqual([])
  expect(h.save).not.toHaveBeenCalled()
})

test('patient library takes precedence, removed data is not restored, and locked access stays empty', () => {
  const sourceRootTiles = [...DEFAULT_BOARD_FIXTURES.find(board => board.id === 'root')!.tiles]
  const own = [{ id: 'private-patient-a', name: 'patient test board', tiles: [] }]
  h.boards = own
  const displayed = loadCommunicationBoards()
  expect(displayed).toContain(own[0])
  const root = displayed.find(board => board.id === 'root')!
  expect(root.tiles.filter(tile => tile.loadBoardId === own[0].id).map(tile => tile.label)).toEqual([
    'patient test board'
  ])
  expect(
    loadCommunicationBoards()
      .find(board => board.id === 'root')
      ?.tiles.filter(tile => tile.loadBoardId === own[0].id)
  ).toHaveLength(1)
  expect(DEFAULT_BOARD_FIXTURES.find(board => board.id === 'root')!.tiles).toEqual(sourceRootTiles)
  expect(own[0].tiles).toEqual([])
  expect(displayed.find(board => board.id === 'root')?.tiles.some(tile => tile.label === '我要喝水')).toBe(true)
  expect(h.boards).toBe(own)
  h.context = { profileId: 'patient-b' }
  h.boards = []
  expect(loadCommunicationBoards().some(board => board.id === 'private-patient-a')).toBe(false)
  expect(h.save).not.toHaveBeenCalled()
  h.locked = true
  expect(loadCommunicationBoards()).toEqual([])
  h.locked = false
})

test('a patient board overrides the same bundled identity without duplicated boards or writes', () => {
  h.locked = false
  const replacement = { ...DEFAULT_BOARD_FIXTURES[0], tiles: [] }
  h.boards = [replacement]
  const displayed = loadCommunicationBoards()
  expect(displayed.filter(board => board.id === replacement.id)).toEqual([replacement])
  expect(new Set(displayed.map(board => board.id)).size).toBe(displayed.length)
  expect(h.boards).toEqual([replacement])
  expect(h.save).not.toHaveBeenCalled()
})

test('the shipped mini catalog resolves every Web default reference to its corresponding packaged symbol', () => {
  const web = createCareBuiltinImages(webBoards.advanced as any)
  const local = new Map(DEFAULT_BOARD_FIXTURES.flatMap(board => board.tiles.map(tile => [JSON.stringify([board.id, tile.id]), tile.image])))
  for (const board of webBoards.advanced) for (const tile of board.tiles) {
    if (!tile.image) continue
    const reference = web.reference(tile.image)!
    const expected = local.get(JSON.stringify([reference.boardId, reference.tileId]))
    expect(expected).toBeTruthy()
    expect(careBuiltinImages.resolve(reference)).toBe(expected)
  }
})

test('existing patient sees the 15 bundled words without changing or uploading its own boards', () => {
  h.context = { profileId: 'synthetic-existing-patient' }
  h.locked = false
  const own = [{ id: 'synthetic-personal', name: '个人图库', tiles: [] }]
  h.boards = own
  const displayed = loadCommunicationBoards()
  for (const card of builtin15.cards) for (const token of card.tokens) {
    expect(runReceiverSession(token, displayed).reviewItems[0].tile?.id).toBe(card.id)
  }
  expect(h.boards).toBe(own)
  expect(h.save).not.toHaveBeenCalled()
})

test('a customized same-ID board is not overwritten by a bundled update', () => {
  h.context = { profileId: 'synthetic-existing-patient' }
  h.locked = false
  const card = builtin15.cards.find(card => card.label === '刷牙')!
  const customized = { id: card.board, name: '我的卫生图板', tiles: [] }
  h.boards = [customized]
  const displayed = loadCommunicationBoards()
  expect(displayed.find(board => board.id === card.board)).toBe(customized)
  expect(runReceiverSession('刷牙', displayed).reviewItems[0].tile).toBeNull()
  expect(h.save).not.toHaveBeenCalled()
})

test('legacy guest library remains unchanged instead of silently restoring removed cards', () => {
  h.context = null
  h.locked = false
  const old = DEFAULT_BOARD_FIXTURES.map(board => ({
    ...board, tiles: board.tiles.filter(tile => !tile.id.startsWith('tuyujia-builtin-'))
  }))
  h.boards = old
  expect(loadCommunicationBoards()).toBe(old)
  expect(runReceiverSession('刷牙', loadCommunicationBoards()).reviewItems[0].tile).toBeNull()
  expect(h.save).not.toHaveBeenCalled()
})
