import { expect, test } from 'vitest'
import { createBoardDTO } from '@cboard-communication-core/dto'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createPictureLibraryStore } from '../../platform/pictureLibraryStore'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each([
  ['明早七点半叫醒我，请再说一次。', ['明早', '七点半']],
  ['今晚八点一刻回家吃饭', ['今晚', '八点一刻', '回家', '吃饭']],
  ['今天7:30吃饭，水太热', ['今天', '7:30', '吃饭', '热']]
])('uses the shared time units and packaged pictures after offline restore: %s', (text, units) => {
  let session = runReceiverSession(text as string, DEFAULT_BOARD_FIXTURES)
  for (const unit of units) expect(session.segments).toContain(unit)
  expect(session.segments.join('')).toBe(text)
  const meal = session.reviewItems.find(i => i.token === '吃饭')
  if (meal) expect(meal.tile).toBeNull()
  const hot = session.reviewItems.find(i => i.token === '热')
  if (hot) expect(hot.tile!.id).toBe('tuyujia-builtin-object-heat')
  for (const item of session.reviewItems.filter(i => !i.tile)) session = retainReceiverItemAsText(session, item.id)
  const saved = JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(session)))
  const restored = restoreReceiverWorkspaceFromRecord(saved, [])!.session
  expect(restored.outputPreview.map(i => i.vocalization).join('')).toBe(text)
  expect(restored.outputPreview.map(i => i.image)).toEqual(session.outputPreview.map(i => i.image))
})

test('an imported personal meal picture survives confirmation and offline restore', () => {
  const image = 'data:image/png;base64,c3ludGhldGlj'
  const personal = createBoardDTO({ id: 'synthetic-personal-meals', name: '个人用餐', tiles: [
    { id: 'synthetic-edited-meal', label: '吃饭', vocalization: '吃饭', image },
    { id: 'breakfast', label: '吃早饭', image: '/breakfast-with-sun.png' }
  ] })
  let state = runReceiverSession('明早七点半吃饭', [...DEFAULT_BOARD_FIXTURES, personal])
  expect(state.reviewItems.find(i => i.token === '吃饭')!.tile!.tile.image).toBe(image)
  for (const item of state.reviewItems.filter(i => !i.tile)) state = retainReceiverItemAsText(state, item.id)
  const saved = JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(state)))
  const restored = restoreReceiverWorkspaceFromRecord(saved, [])!.session
  expect(restored.outputPreview.map(i => i.vocalization).join('')).toBe('明早七点半吃饭')
  expect(restored.reviewItems.find(i => i.token === '吃饭')!.tile!.tile.image).toBe(image)
  expect(runReceiverSession('吃饭', DEFAULT_BOARD_FIXTURES).reviewItems[0].tile).toBeNull()
})

// Optional local acceptance input. Never check a user's gallery/image into fixtures.
test.runIf(Boolean(process.env.TUYUJIA_PERSONAL_MEAL_FIXTURE))('restores the supplied personal meal image through the existing library store', () => {
  const raw = JSON.parse(readFileSync(process.env.TUYUJIA_PERSONAL_MEAL_FIXTURE!, 'utf8'))
  const personal = raw.map((b: unknown) => createBoardDTO(b))
  const values = new Map<string, string>()
  const storage = {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: string) => { values.set(key, value) },
    removeStorageSync: (key: string) => { values.delete(key) }
  }
  createPictureLibraryStore(storage, DEFAULT_BOARD_FIXTURES).save([...DEFAULT_BOARD_FIXTURES, ...personal])
  const restoredLibrary = createPictureLibraryStore(storage, []).load()
  let state = runReceiverSession('我今晚不回家吃饭', restoredLibrary)
  const original = personal[0].tiles[0]
  expect(state.reviewItems.find(i => i.token === '吃饭')!.tile!.tile.image).toBe(original.image)
  const digest = (value: string) => createHash('sha256').update(Buffer.from(value.split(',')[1], 'base64')).digest('hex')
  expect(digest(original.image)).toBe(process.env.TUYUJIA_PERSONAL_MEAL_SHA256)
  for (const item of state.reviewItems.filter(i => !i.tile)) state = retainReceiverItemAsText(state, item.id)
  const record = JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(state)))
  const restored = restoreReceiverWorkspaceFromRecord(record, [])!.session
  expect(restored.reviewItems.find(i => i.token === '吃饭')!.tile!.tile.image).toBe(original.image)
  expect(restored.outputPreview.map(i => i.vocalization).join('')).toBe('我今晚不回家吃饭')
})
