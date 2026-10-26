import { expect, test } from 'vitest'
import { createBoardDTO, type BoardDTO } from '@cboard-communication-core/dto'
import { createGalleryTileUndoAdapter } from './galleryTileUndoAdapter'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function fixture() {
  const original = createBoardDTO({ id: 'personal_synthetic', name: 'Synthetic people', tiles: [
    { id: 'before', label: 'before' },
    { id: 'synthetic-person', label: '合成人物', image: 'wxfile://usr/synthetic.png', sound: 'wxfile://usr/synthetic.mp3',
      video: 'wxfile://usr/synthetic.mp4', communication: { category: 'people', synonyms: ['合成人物'] } },
    { id: 'after', label: 'after' }
  ] })
  let boards = [original, createBoardDTO({ id: 'personal_other', name: 'Other', tiles: [] })]
  let scope = 'synthetic-scope'
  let editable = true
  let fault = ''
  let saves = 0
  let reads = 0
  let onLoad: ((n: number) => void) | undefined
  const store = {
    load: () => { reads++; onLoad?.(reads); return clone(boards) },
    save: (value: BoardDTO[]) => {
      saves++
      if (fault === 'throw') throw new Error('synthetic storage failure')
      if (fault !== 'silent') boards = clone(value)
      return value
    }
  }
  const service = createGalleryTileUndoAdapter({ store, getScopeKey: () => scope, canManage: () => editable })
  return { service, original, store, get boards() { return boards }, set boards(value) { boards = value },
    get saves() { return saves }, set fault(value: string) { fault = value },
    set scope(value: string) { scope = value }, set editable(value: boolean) { editable = value },
    set onLoad(value: (n: number) => void) { onLoad = value } }
}

test('deletes and restores exact identity, media, layout, and position using current boards', async () => {
  const f = fixture()
  const removed = await f.service.delete(f.original.id, 'synthetic-person')
  expect(removed.changed).toBe(true)
  expect(f.boards[0].tiles.map(tile => tile.id)).toEqual(['before', 'after'])
  f.boards[1].name = 'Subsequent unrelated edit'
  const restored = await f.service.undo(f.service.state().operationId!)
  expect(restored.tile).toEqual(f.original.tiles[1])
  expect(f.boards[0]).toEqual(f.original)
  expect(f.boards[1].name).toBe('Subsequent unrelated edit')
  expect(f.service.state().count).toBe(0)
})

test.each(['throw', 'silent'])('%s persistence failure retains undo and does not claim success', async fault => {
  const f = fixture(); f.fault = fault
  await expect(f.service.delete(f.original.id, 'synthetic-person')).rejects.toThrow()
  expect(f.boards[0]).toEqual(f.original)
  expect(f.service.state().count).toBe(1)
  f.fault = ''
  await f.service.delete(f.original.id, 'synthetic-person')
  expect(f.service.state().count).toBe(1)
  expect(f.boards[0].tiles.some(tile => tile.id === 'synthetic-person')).toBe(false)
})

test('silent undo failure retains its receipt for a verified retry', async () => {
  const f = fixture()
  await f.service.delete(f.original.id, 'synthetic-person')
  const operationId = f.service.state().operationId!
  f.fault = 'silent'
  await expect(f.service.undo(operationId)).rejects.toThrow()
  expect(f.service.state().operationId).toBe(operationId)
  f.fault = ''
  await f.service.undo(operationId)
  expect(f.boards[0]).toEqual(f.original)
})

test('compare-and-save refuses a concurrently edited target', async () => {
  const f = fixture()
  f.onLoad = n => { if (n === 2) f.boards[0].name = 'Concurrent board edit' }
  await expect(f.service.delete(f.original.id, 'synthetic-person')).rejects.toThrow()
  expect(f.saves).toBe(0)
  expect(f.boards[0].name).toBe('Concurrent board edit')
  expect(f.boards[0].tiles).toEqual(f.original.tiles)
})

test('the latest other-board change survives a target save', async () => {
  const f = fixture()
  f.onLoad = n => { if (n === 2) f.boards[1].name = 'Concurrent other board edit' }
  await f.service.delete(f.original.id, 'synthetic-person')
  expect(f.boards[1].name).toBe('Concurrent other board edit')
})

test('cancelled queued deletion does not write and duplicate calls share one save', async () => {
  const f = fixture()
  let active = true
  const pending = f.service.delete(f.original.id, 'synthetic-person', { guard: () => active })
  active = false
  await expect(pending).rejects.toThrow()
  expect(f.saves).toBe(0)
  const first = f.service.delete(f.original.id, 'synthetic-person')
  const second = f.service.delete(f.original.id, 'synthetic-person')
  expect(second).toBe(first)
  await first
  expect(f.saves).toBe(1)
})

test('privacy/identity scope change clears snapshots and permission removal blocks recovery', async () => {
  const f = fixture()
  await f.service.delete(f.original.id, 'synthetic-person')
  const operationId = f.service.state().operationId!
  f.editable = false
  await expect(f.service.undo(operationId)).rejects.toThrow()
  expect(f.saves).toBe(1)
  f.scope = 'new-privacy-generation-or-profile'
  expect(f.service.state().count).toBe(0)
  await expect(f.service.undo(operationId)).rejects.toThrow()
  expect(f.saves).toBe(1)
})
