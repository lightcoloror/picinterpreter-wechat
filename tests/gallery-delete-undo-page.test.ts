import { beforeEach, expect, test, vi } from 'vitest'
import { createBoardDTO } from '@cboard-communication-core/dto'
import { createDevicePrivatePictogramAttribution } from '@cboard-communication-core/pictogramAttribution'

const h = vi.hoisted(() => ({
  hooks: [] as any[], index: 0, effects: [] as (() => void)[], show: () => {}, hide: () => {},
  scope: 'synthetic-account:family:person:privacy-1', editable: true,
  boards: [] as any[],
  undo: { count: 0, operationId: null as string | null, label: '' },
  listeners: new Set<(state: any) => void>(),
  remove: vi.fn(), restore: vi.fn()
}))
vi.mock('react', async () => ({
  ...await vi.importActual('react'),
  useState(initial: any) {
    const index = h.index++
    if (!(index in h.hooks)) h.hooks[index] = typeof initial === 'function' ? initial() : initial
    return [h.hooks[index], (value: any) => { h.hooks[index] = typeof value === 'function' ? value(h.hooks[index]) : value }]
  },
  useRef(initial: any) {
    const index = h.index++
    if (!(index in h.hooks)) h.hooks[index] = { current: initial }
    return h.hooks[index]
  },
  useEffect(effect: () => any, deps: any[]) {
    const index = h.index++
    const previous = h.hooks[index]
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      h.effects.push(() => { previous?.cleanup?.(); h.hooks[index] = { deps, cleanup: effect() } })
    }
  }
}))
vi.mock('@tarojs/components', () => ({ Button: 'Button', Text: 'Text', View: 'View' }))
vi.mock('@tarojs/taro', () => ({
  useDidShow: (callback: () => void) => { h.show = callback },
  useDidHide: (callback: () => void) => { h.hide = callback },
  default: { getStorageSync: () => '', eventCenter: { on: vi.fn(), off: vi.fn() }, navigateBack: vi.fn(async () => {}), reLaunch: vi.fn(), navigateTo: vi.fn() }
}))
vi.mock('../src/features/communication/PersonalImageManager', () => ({ default: 'PersonalImageManager' }))
vi.mock('../src/packages/backup/CustomPictogramEditor', () => ({ default: 'CustomPictogramEditor' }))
vi.mock('../src/packages/backup/PublicBoardPublisher', () => ({ default: 'PublicBoardPublisher' }))
vi.mock('../src/config/runtimeCapabilities', () => ({ runtimeCapabilities: { cloudFeatures: false } }))
vi.mock('../src/packages/backup/personalImageLibrary', () => ({ rebasePersonalImageLibraryBoards: (boards: any) => boards }))
vi.mock('../src/platform/taroCommunicationRepository', () => ({ createTaroCommunicationRepository: () => ({ loadPersonalImagePreferences: () => [] }) }))
vi.mock('../src/platform/taroCareContext', () => ({
  canEditCareLibrary: () => h.editable, canEditCarePreferences: () => h.editable,
  careScopedKey: (key: string) => h.scope + key, currentCareContext: () => null
}))
vi.mock('../src/platform/taroPictureLibraryStore', () => ({ taroPictureLibraryStore: { load: () => h.boards, save: vi.fn() } }))
vi.mock('../src/platform/taroGalleryTileUndo', () => ({
  currentGalleryUndoScope: () => h.scope,
  taroGalleryTileUndo: { state: () => h.undo, delete: (...args: any[]) => h.remove(...args), undo: (...args: any[]) => h.restore(...args),
    subscribe: (listener: (state: any) => void) => { h.listeners.add(listener); return () => h.listeners.delete(listener) } }
}))

import PersonalImageLibraryPage from '../src/packages/backup/pages/personal-images/index'
const nodes = (element: any): any[] => !element || typeof element !== 'object' ? [] :
  [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]
function render() {
  h.index = 0
  const tree = PersonalImageLibraryPage()
  const effects = h.effects.splice(0)
  effects.forEach(effect => effect())
  return tree
}
const byId = (tree: any, id: string) => nodes(tree).find(node => node.props?.id === id)
const editor = (tree: any) => nodes(tree).find(node => node.type === 'CustomPictogramEditor').props
const manager = (tree: any) => nodes(tree).find(node => node.type === 'PersonalImageManager').props
function updateUndo(value: typeof h.undo) { h.undo = value; h.listeners.forEach(listener => listener(value)) }
function deferred() { let resolve!: (value: any) => void, reject!: (error: Error) => void; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

beforeEach(() => {
  h.hooks.forEach(value => value?.cleanup?.())
  h.hooks = []; h.index = 0; h.effects = []; h.listeners.clear()
  h.scope = 'synthetic-account:family:person:privacy-1'; h.editable = true
  h.undo = { count: 0, operationId: null, label: '' }
  h.boards = [createBoardDTO({ id: 'personal_synthetic', name: 'Synthetic', tiles: [{
    id: 'device_private_custom_synthetic-person', label: '合成人物', image: 'wxfile://usr/synthetic.png',
    pictogramAttribution: createDevicePrivatePictogramAttribution({ boardId: 'personal_synthetic', tileId: 'device_private_custom_synthetic-person', label: '合成人物' })
  }] })]
  h.remove.mockReset(); h.restore.mockReset()
})

test('both gallery removal entrances await persistence and prevent overlapping deletion', async () => {
  const pending = deferred()
  h.remove.mockImplementation(() => {
    updateUndo({ count: 1, operationId: 'synthetic-operation', label: '合成人物' })
    return pending.promise
  })
  const first = editor(render()).onRemove('personal_synthetic', 'device_private_custom_synthetic-person')
  const tree = render()
  expect(byId(tree, 'gallery-delete-undo-button').props.disabled).toBe(true)
  expect(byId(tree, 'gallery-delete-undo-status').props.children).toBe('正在确认删除…')
  await expect(manager(tree).onRemoveCuratedPublic('personal_synthetic', 'other')).resolves.toBe(false)
  expect(h.remove).toHaveBeenCalledTimes(1)
  pending.resolve({ changed: true, board: h.boards[0], ...h.undo })
  await expect(first).resolves.toBe(true)
  expect(byId(render(), 'gallery-delete-undo-status').props.children).toContain('已删除')
  expect(byId(render(), 'gallery-delete-undo-button').props.disabled).toBe(false)
})

test('failed removal and undo retain a visible retry and never announce success', async () => {
  updateUndo({ count: 1, operationId: 'synthetic-operation', label: '合成人物' })
  h.remove.mockRejectedValue(new Error('synthetic write failure'))
  await expect(editor(render()).onRemove('personal_synthetic', 'device_private_custom_synthetic-person')).resolves.toBe(false)
  expect(byId(render(), 'gallery-delete-undo-status').props.children).toContain('删除尚未确认')
  h.restore.mockRejectedValueOnce(new Error('synthetic write failure'))
  await byId(render(), 'gallery-delete-undo-button').props.onClick()
  await Promise.resolve(); await Promise.resolve()
  expect(byId(render(), 'gallery-delete-undo-status').props.children).toContain('恢复尚未确认')
  expect(byId(render(), 'gallery-delete-undo-button').props.disabled).toBe(false)
  h.restore.mockImplementation(async () => {
    updateUndo({ count: 0, operationId: null, label: '' })
    return { changed: false, board: h.boards[0] }
  })
  byId(render(), 'gallery-delete-undo-button').props.onClick()
  await Promise.resolve(); await Promise.resolve()
  expect(byId(render(), 'gallery-delete-undo-status').props.children).toContain('已恢复图卡')
  expect(byId(render(), 'gallery-delete-undo-button')).toBeUndefined()
})

test('verified idempotent delete is accepted even when changed is false', async () => {
  h.remove.mockResolvedValue({ changed: false, board: h.boards[0], label: '合成人物' })
  await expect(editor(render()).onRemove('personal_synthetic', 'device_private_custom_synthetic-person')).resolves.toBe(true)
  expect(byId(render(), 'gallery-delete-undo-status').props.children).toContain('已删除')
})

test.each(['hide-show', 'scope-a-b-a', 'cancel-editor'])('%s invalidates queued work and suppresses stale success', async boundary => {
  const pending = deferred()
  let guard = () => true
  h.remove.mockImplementation((_board, _tile, options) => { guard = options.guard; return pending.promise })
  let editorCurrent = true
  const first = editor(render()).onRemove('personal_synthetic', 'device_private_custom_synthetic-person', { guard: () => editorCurrent })
  if (boundary === 'hide-show') { h.hide(); h.show() }
  if (boundary === 'scope-a-b-a') { const old = h.scope; h.scope = 'other'; render(); h.scope = old; render() }
  if (boundary === 'cancel-editor') editorCurrent = false
  expect(guard()).toBe(false)
  pending.resolve({ changed: true, board: h.boards[0], label: '合成人物' })
  await expect(first).resolves.toBe(false)
  expect(String(byId(render(), 'gallery-delete-undo-status')?.props.children)).not.toContain('已删除')
})
