import { expect, test, vi } from 'vitest'
import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { loadCommunicationBoards } from './taroCommunicationBoards'
import { careBuiltinImages } from './taroCareBuiltinImages'
import webBoards from '../../../cboard/src/api/boards.json'
import { createCareBuiltinImages } from '@cboard-communication-core/careBuiltinImages'

const h = vi.hoisted(() => ({ locked: false, boards: [] as any[], context: { profileId: 'patient-a' }, save: vi.fn() }))
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
  const own = [{ id: 'private-patient-a', tiles: [] }]
  h.boards = own
  expect(loadCommunicationBoards()).toBe(own)
  h.context = { profileId: 'patient-b' }
  h.boards = []
  expect(loadCommunicationBoards().some(board => board.id === 'private-patient-a')).toBe(false)
  expect(h.save).not.toHaveBeenCalled()
  h.locked = true
  expect(loadCommunicationBoards()).toEqual([])
  h.locked = false
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
