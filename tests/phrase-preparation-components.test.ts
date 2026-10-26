import { beforeEach, expect, test, vi } from 'vitest'
import SavedPhrasePreparation from '../src/features/communication/SavedPhrasePreparation'
import { SAVED_PHRASE_STARTERS } from '@cboard-communication-core/savedPhrasePreparation'
import { createWechatCommunicationRepository } from '../src/platform/communicationRepository'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory } from '../src/features/communication/receiverSession'

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useEffect: (effect: () => unknown) => effect(), useState: (initial: any) => {
  const index = state.index++
  if (!(index in state.values)) state.values[index] = typeof initial === 'function' ? initial() : initial
  return [state.values[index], (value: any) => { state.values[index] = typeof value === 'function' ? value(state.values[index]) : value }]
}, useRef: (initial: unknown) => {
  const index = state.index++
  if (!(index in state.values)) state.values[index] = { current: initial }
  return state.values[index]
} }))
vi.mock('@tarojs/components', () => ({ Button: 'Button', View: 'View', Text: 'Text', Input: 'Input' }))
vi.mock('../src/features/communication/ReceiverWorkspace', () => ({ default: 'ReceiverWorkspace' }))
function nodes(element: any): any[] {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]
}
const button = (tree: any, label: string) => nodes(tree).find(node => node.type === 'Button' && node.props.children === label)
const render = (props: any) => { state.index = 0; return SavedPhrasePreparation(props) }
beforeEach(() => { state.values = []; state.index = 0; vi.clearAllMocks() })

test.each(['edit', 'copy'] as const)('mini %s uses ordered saved snapshots and explicit save labels', mode => {
  const values = new Map<string, unknown>()
  const repository = createWechatCommunicationRepository({ getStorageSync: key => values.get(key) ?? '',
    setStorageSync: (key, value) => { values.set(key, value) }, removeStorageSync: key => { values.delete(key) } })
  repository.saveCommunicationPhrase({ id: 'original', sentence: '原句', output: [{ id: 'same', label: '合成一', image: 'wxfile://synthetic-one.png' },{ id: 'same', label: '合成二', image: 'wxfile://synthetic-two.png' }] })
  const before = repository.loadCommunicationSavedPhrases()
  const props = { repository, initialRequest: { id: 'original', mode }, getScopeKey: () => 'synthetic', receiverProps: { boards: [] }, onSaved: vi.fn(), onClose: vi.fn(), onInvalidate: vi.fn() }
  render(props); let tree = render(props)
  const workspace = nodes(tree).find(node => node.type === 'ReceiverWorkspace').props
  expect(workspace.preparationSaveLabel).toBe(mode === 'edit' ? '确认更新这条常用语' : '确认另存为新常用语')
  expect(workspace.initialState.session.outputPreview.map((x: any) => x.image)).toEqual(before[0].output.map(x => x.image))
  button(tree, '取消准备').props.onClick(); tree = render(props)
  expect(repository.loadSavedPhrasePreparation()).toBeNull()
  expect(repository.loadCommunicationSavedPhrases()).toEqual(before)
  expect(props.onSaved).not.toHaveBeenCalled()
});
test.each(SAVED_PHRASE_STARTERS)('mini component $id defers work until explicit matching and saves only a favorite', template => {
  const values = new Map<string, unknown>()
  const repository = createWechatCommunicationRepository({ getStorageSync: key => values.get(key) ?? '',
    setStorageSync: (key, value) => { values.set(key, value) }, removeStorageSync: key => { values.delete(key) } })
  const props = { repository, getScopeKey: () => 'synthetic', receiverProps: { boards: [] }, onSaved: vi.fn(), onClose: vi.fn(), onInvalidate: vi.fn() }
  let tree = render(props)
  expect(nodes(tree).some(node => node.type === 'ReceiverWorkspace')).toBe(false)
  button(tree, template.text).props.onClick()
  tree = render(props)
  let workspace = nodes(tree).find(node => node.type === 'ReceiverWorkspace').props
  expect(workspace.preparationMode).toBe(true)
  expect(workspace.initialState.session.inputText).toBe(template.text)
  expect(workspace.initialState.session.matched).toBe(false)
  let session = runReceiverSession(template.text, [])
  session.reviewItems.filter(item => !item.tile).forEach(item => { session = retainReceiverItemAsText(session, item.id) })
  const entry = buildConfirmedReceiverHistory(session)!
  workspace.onUpdateDraft(repository.loadSavedPhrasePreparation(), entry)
  tree = render(props); workspace = nodes(tree).find(node => node.type === 'ReceiverWorkspace').props
  workspace.onConfirmPreparedPhrase(entry); workspace.onConfirmPreparedPhrase(entry)
  expect(props.onSaved).toHaveBeenCalledTimes(1)
  expect(repository.loadCommunicationSavedPhrases()).toHaveLength(1)
  expect(repository.loadCommunicationSavedPhrases()[0].lifeContext).toBe(template.lifeContext)
  expect(repository.loadReceiverRecords()).toEqual([])
  expect(repository.loadCommunicationHistory()).toEqual([])
})
