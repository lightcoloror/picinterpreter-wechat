import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, test, vi } from 'vitest'

import { createDraftImageRegistry } from './draftImageRegistry'
import { createDraftSoundRegistry } from './draftSoundRegistry'
import { createDraftVideoRegistry } from './draftVideoRegistry'

// Execute the actual component callbacks, matching the repository's page
// callback tests. No browser, developer tool, network or real media is used.
const filename = resolve(__dirname, 'CustomPictogramEditor.tsx')
const ast = ts.createSourceFile(filename, readFileSync(filename, 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function callback(name: string, context: Record<string, unknown>) {
  let source = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      source = node.initializer.getText(ast)
    }
    if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === name) source = node.getText(ast)
    if (name === 'unmount' && ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
      const effect = node.arguments[0]
      if (effect && ts.isArrowFunction(effect) && ts.isArrowFunction(effect.body) &&
          effect.body.getText(ast).includes('mountedRef.current = false')) source = effect.body.getText(ast)
      if (effect && ts.isArrowFunction(effect) && ts.isBlock(effect.body)) {
        for (const statement of effect.body.statements) {
          if (ts.isReturnStatement(statement) && statement.expression &&
              statement.expression.getText(ast).includes('mountedRef.current = false')) {
            source = statement.expression.getText(ast)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!source) throw new Error(`Callback not found: ${name}`)
  const box = { module: { exports: undefined as unknown }, ...context }
  runInNewContext(ts.transpileModule(`module.exports = ${source}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 }
  }).outputText, box)
  return box.module.exports as (...args: any[]) => any
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function fixture() {
  let epoch = 1
  const tile = {
    id: 'device_private_custom_synthetic', label: '合成林安',
    image: 'synthetic-private:saved-image', sound: 'synthetic-private:saved-sound',
    video: 'synthetic-private:saved-video'
  }
  const editingEntry = { boardId: 'board-a', boardName: '合成板', tile }
  const state = {
    busy: '', notice: '', editingEntry: editingEntry as typeof editingEntry | null,
    draft: { boardId: 'board-a', label: '合成未保存文字', image: tile.image, sound: tile.sound, video: tile.video },
    originalImage: tile.image
  }
  const imagePort = { remove: vi.fn(async () => true) }
  const soundPort = { remove: vi.fn(async () => true), cancel: vi.fn() }
  const videoPort = { remove: vi.fn(async () => true) }
  const soundRegistry = createDraftSoundRegistry()
  soundRegistry.begin(tile.sound)
  const videoRegistry = createDraftVideoRegistry()
  videoRegistry.begin(tile.video)
  const imageRegistry = createDraftImageRegistry()
  const onRemove = vi.fn(async (_boardId: string, _tileId: string, _options: { guard: () => boolean }) => true)
  const showModal = vi.fn(async () => ({ confirm: true }))
  const context: Record<string, any> = {
    boards: [{ id: 'board-a', tiles: [tile] }], editingEntry, draft: state.draft,
    controlsBusy: false, mountedRef: { current: true }, canEditRef: { current: true },
    deleteRevisionRef: { current: 0 }, deletePendingRef: { current: null },
    requestIdRef: { current: 0 }, soundRequestIdRef: { current: 0 },
    currentImageOperationEpoch: () => epoch,
    Taro: { showModal }, onRemove,
    setBusyAction: (value: string) => { state.busy = value },
    setNotice: (value: string) => { state.notice = value },
    setEditingEntry: (value: typeof editingEntry | null) => { state.editingEntry = value },
    setDraft: (value: typeof state.draft) => { state.draft = value },
    setOriginalImage: (value: string) => { state.originalImage = value },
    setIsRecordingSound: vi.fn(),
    taroPersonalImagePort: imagePort, taroTileAudioRecordingPort: soundPort,
    taroPersonalVideoPort: videoPort, wechatTileAudioPort: { stop: vi.fn() },
    draftImageRegistryRef: { current: imageRegistry },
    draftSoundRegistryRef: { current: soundRegistry },
    draftVideoRegistryRef: { current: videoRegistry },
    removeLocalSounds: async (paths: string[]) => { for (const path of paths) await soundPort.remove(path) },
    removeLocalVideos: async (paths: string[]) => { for (const path of paths) await videoPort.remove(path) }
  }
  context.emptyDraft = callback('emptyDraft', context)
  context.invalidatePendingDelete = callback('invalidatePendingDelete', context)
  return {
    state, context, tile, onRemove, showModal, imagePort, soundPort, videoPort,
    soundRegistry, videoRegistry, imageRegistry,
    remove: () => callback('removeEntry', context)('board-a', tile.id, tile.label),
    cancel: callback('cancelEditing', context),
    unmount: callback('unmount', context),
    changeEpoch: () => { epoch += 1 }
  }
}

test('waits for explicit async true before closing and never unlinks saved media', async () => {
  const f = fixture()
  const gate = deferred<boolean>()
  const started = deferred<void>()
  f.onRemove.mockImplementationOnce(() => { started.resolve(undefined); return gate.promise })
  const pending = f.remove()
  await started.promise
  expect(f.onRemove).toHaveBeenCalledOnce()
  const guard = f.onRemove.mock.calls[0][2].guard
  expect(guard()).toBe(true)
  expect(f.state.editingEntry?.tile.id).toBe(f.tile.id)
  expect(f.state.draft.label).toBe('合成未保存文字')
  expect(f.state.busy).toBe(f.tile.id)
  gate.resolve(true)
  await pending
  expect(f.state.editingEntry).toBeNull()
  expect(f.state.draft.label).toBe('')
  expect(f.state.notice).toContain('媒体已保留')
  expect(f.state.busy).toBe('')
  expect(f.imagePort.remove).not.toHaveBeenCalled()
  expect(f.soundPort.remove).not.toHaveBeenCalled()
  expect(f.videoPort.remove).not.toHaveBeenCalled()
})

test.each(['false', 'reject'])('failed removal retains exact editing content and can retry (%s)', async mode => {
  const f = fixture()
  const before = JSON.stringify(f.state.draft)
  if (mode === 'false') f.onRemove.mockResolvedValueOnce(false)
  else f.onRemove.mockRejectedValueOnce(new Error('synthetic persistence failure'))
  await f.remove()
  expect(JSON.stringify(f.state.draft)).toBe(before)
  expect(f.state.editingEntry?.tile.id).toBe(f.tile.id)
  expect(f.state.originalImage).toBe(f.tile.image)
  expect(f.state.notice).toContain('删除未确认')
  expect(f.state.busy).toBe('')
  expect(f.imagePort.remove).not.toHaveBeenCalled()
  expect(f.soundPort.remove).not.toHaveBeenCalled()
  expect(f.videoPort.remove).not.toHaveBeenCalled()
  await f.remove()
  expect(f.onRemove).toHaveBeenCalledTimes(2)
  expect(f.state.editingEntry).toBeNull()
})

test('canceling confirmation makes no repository call and keeps the editor', async () => {
  const f = fixture()
  f.showModal.mockResolvedValueOnce({ confirm: false })
  await f.remove()
  expect(f.onRemove).not.toHaveBeenCalled()
  expect(f.state.editingEntry?.tile.id).toBe(f.tile.id)
  expect(f.state.busy).toBe('')
})

test('double click while confirmation is pending opens one modal and deletes once', async () => {
  const f = fixture()
  const gate = deferred<{ confirm: boolean }>()
  f.showModal.mockImplementationOnce(() => gate.promise)
  const first = f.remove()
  const second = f.remove()
  expect(f.showModal).toHaveBeenCalledOnce()
  gate.resolve({ confirm: true })
  await Promise.all([first, second])
  expect(f.onRemove).toHaveBeenCalledOnce()
})

test.each(['epoch', 'permission', 'unmount'])('late confirmation is ignored after %s invalidation', async kind => {
  const f = fixture()
  const gate = deferred<{ confirm: boolean }>()
  f.showModal.mockImplementationOnce(() => gate.promise)
  const pending = f.remove()
  if (kind === 'epoch') f.changeEpoch()
  if (kind === 'permission') f.context.canEditRef.current = false
  if (kind === 'unmount') f.unmount()
  gate.resolve({ confirm: true })
  await pending
  expect(f.onRemove).not.toHaveBeenCalled()
  expect(f.state.editingEntry?.tile.id).toBe(f.tile.id)
  expect(f.state.notice).not.toContain('已从图库删除')
})

test('canceling editing invalidates the guard before a queued storage write', async () => {
  const f = fixture()
  const gate = deferred<boolean>()
  const started = deferred<void>()
  let persisted = false
  f.onRemove.mockImplementationOnce(async (_boardId, _tileId, { guard }) => {
    started.resolve(undefined)
    await gate.promise
    if (!guard()) return false
    persisted = true
    return true
  })
  const pending = f.remove()
  await started.promise
  f.cancel()
  const notice = f.state.notice
  expect(f.onRemove.mock.calls[0][2].guard()).toBe(false)
  gate.resolve(true)
  await pending
  expect(persisted).toBe(false)
  expect(f.state.notice).toBe(notice)
  expect(f.state.busy).toBe('')
  expect(f.imagePort.remove).not.toHaveBeenCalled()
  expect(f.soundPort.remove).not.toHaveBeenCalled()
  expect(f.videoPort.remove).not.toHaveBeenCalled()
})

test('unmount after confirmed deletion request suppresses the late completion', async () => {
  const f = fixture()
  const gate = deferred<boolean>()
  const started = deferred<void>()
  f.onRemove.mockImplementationOnce(() => { started.resolve(undefined); return gate.promise })
  const pending = f.remove()
  await started.promise
  f.unmount()
  expect(f.onRemove.mock.calls[0][2].guard()).toBe(false)
  const before = JSON.stringify(f.state)
  gate.resolve(true)
  await pending
  expect(JSON.stringify(f.state)).toBe(before)
})

test('an old completion cannot clear the busy state of a newer delete request', async () => {
  const f = fixture()
  const oldGate = deferred<boolean>()
  const newGate = deferred<boolean>()
  const oldStarted = deferred<void>()
  const newStarted = deferred<void>()
  f.onRemove.mockImplementationOnce(() => { oldStarted.resolve(undefined); return oldGate.promise })
  const oldPending = f.remove()
  await oldStarted.promise
  f.cancel()
  f.onRemove.mockImplementationOnce(() => { newStarted.resolve(undefined); return newGate.promise })
  const newPending = f.remove()
  await newStarted.promise
  const revision = f.context.deletePendingRef.current
  oldGate.resolve(true)
  await oldPending
  expect(f.state.busy).toBe(f.tile.id)
  expect(f.context.deletePendingRef.current).toBe(revision)
  newGate.resolve(false)
  await newPending
  expect(f.state.busy).toBe('')
  expect(f.state.notice).toContain('删除未确认')
})

test('successful deletion still cleans only owned uncommitted replacements', async () => {
  const f = fixture()
  f.soundRegistry.replace('synthetic-private:draft-sound')
  f.videoRegistry.replace('synthetic-private:draft-video')
  await f.remove()
  expect(f.soundPort.remove.mock.calls).toEqual([['synthetic-private:draft-sound']])
  expect(f.videoPort.remove.mock.calls).toEqual([['synthetic-private:draft-video']])
  expect(f.imagePort.remove).not.toHaveBeenCalled()
})

test('unmount keeps saved media and cleans uncommitted image, sound and video drafts', () => {
  const f = fixture()
  f.imageRegistry.replace('synthetic-private:draft-image')
  f.soundRegistry.replace('synthetic-private:draft-sound')
  f.videoRegistry.replace('synthetic-private:draft-video')
  f.unmount()
  expect(f.imagePort.remove.mock.calls).toEqual([['synthetic-private:draft-image']])
  expect(f.soundPort.remove.mock.calls).toEqual([['synthetic-private:draft-sound']])
  expect(f.videoPort.remove.mock.calls).toEqual([['synthetic-private:draft-video']])
})
