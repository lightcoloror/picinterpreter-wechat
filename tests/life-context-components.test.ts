import { beforeEach, expect, test, vi } from 'vitest'
import SavedPhrasesPanel from '../src/features/communication/SavedPhrasesPanel'
import SavedPhraseManager from '../src/features/communication/SavedPhraseManager'
import LifeContextFilter from '../src/features/communication/LifeContextFilter'
import { wechatSpeechPort } from '../src/platform/taroSpeechPort'

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useEffect: () => {}, useRef: (value: unknown) => ({ current: value }), useState: (initial: unknown) => {
  const index = state.index++
  if (!(index in state.values)) state.values[index] = initial
  return [state.values[index], (value: unknown) => { state.values[index] = value }]
} }))
vi.mock('@tarojs/components', () => ({ Button: 'Button', View: 'View', Text: 'Text', Input: 'Input', ScrollView: 'ScrollView' }))
vi.mock('../src/components/PictogramImage', () => ({ default: 'PictogramImage' }))
vi.mock('../src/platform/taroSpeechPort', () => ({ wechatSpeechPort: { speak: vi.fn() } }))
vi.mock('../src/platform/taroCommunicationFilePort', () => ({ taroCommunicationFilePort: {} }))
vi.mock('@tarojs/taro', () => ({ useDidHide: () => {}, default: { navigateTo: vi.fn(async () => {}), nextTick: vi.fn(), pageScrollTo: vi.fn(async () => {}) } }))
vi.mock('../src/platform/taroCareContext', () => ({ careScopedKey: (key: string) => key }))

const entries = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, sentence: `合成表达${i}`, usageCount: i, createdAt: 100, updatedAt: 100, lastUsedAt: 100,
  lifeContext: i ? '吃饭' : '散步', output: [{ id: 'synthetic', label: '合成', image: 'wxfile://synthetic.png' }] }))
function nodes(element: any): any[] {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]
}
function render(component: any, props: any) { state.index = 0; return component(props) }
function button(tree: any, label: string) {
  return nodes(tree).find(node => node.type === 'Button' && [node.props.children].flat().join('') === label)
}
beforeEach(() => { state.values = []; state.index = 0; vi.clearAllMocks() })

test('failed context save keeps the editor and text for a verified retry', () => {
  const service = { assignLifeContext: vi.fn().mockImplementationOnce(() => { throw Error('synthetic disk failure') }).mockReturnValue(entries) }
  const props = { service, items: [entries[0]], speechRate: 1, onItemsChange: vi.fn(), onReuse: vi.fn() }
  let tree = render(SavedPhraseManager, props)
  button(tree, '情境：散步').props.onClick(); tree = render(SavedPhraseManager, props)
  nodes(tree).find(n => n.type === 'Input' && n.props.placeholder?.startsWith('生活情境')).props.onInput({ detail: { value: '公园散步' } })
  tree = render(SavedPhraseManager, props); button(tree, '保存情境').props.onClick()
  tree = render(SavedPhraseManager, props)
  expect(nodes(tree).some(n => typeof n.props?.children === 'string' && n.props.children.includes('保存失败'))).toBe(true)
  expect(nodes(tree).find(n => n.type === 'Input' && n.props.placeholder?.startsWith('生活情境')).props.value).toBe('公园散步')
  expect(props.onItemsChange).not.toHaveBeenCalled()
  button(tree, '保存情境').props.onClick(); tree = render(SavedPhraseManager, props)
  expect(button(tree, '保存情境')).toBeUndefined()
  expect(props.onItemsChange).toHaveBeenCalledWith(entries)
})

test('mini filters before six-item cutoff and invokes reuse/play only on explicit action', () => {
  const props = { items: entries, onReuse: vi.fn(), onPlay: vi.fn(async () => {}) }
  let tree = render(SavedPhrasesPanel, props)
  expect(nodes(tree).filter(n => n.props?.className === 'saved-phrase-card')).toHaveLength(6)
  expect(nodes(tree).some(n => n.props?.children === '合成表达0')).toBe(false)
  nodes(tree).find(n => n.type === LifeContextFilter).props.onChange('散步')
  tree = render(SavedPhrasesPanel, props)
  expect(nodes(tree).filter(n => n.props?.className === 'saved-phrase-card')).toHaveLength(1)
  expect(props.onPlay).not.toHaveBeenCalled()
  expect(props.onReuse).not.toHaveBeenCalled()
  button(tree, '载入修改').props.onClick()
  button(tree, '一键播报').props.onClick()
  expect(props.onReuse).toHaveBeenCalledWith(entries[0])
  expect(props.onPlay).toHaveBeenCalledWith(entries[0])
})

test('mini context editor cancels, saves metadata through existing service, and never starts speech', () => {
  const service = { assignLifeContext: vi.fn(() => [{ ...entries[0], lifeContext: '公园散步' }]) }
  const props = { service, items: [entries[0]], speechRate: 1, onItemsChange: vi.fn(), onReuse: vi.fn() }
  let tree = render(SavedPhraseManager, props)
  button(tree, '情境：散步').props.onClick()
  tree = render(SavedPhraseManager, props)
  nodes(tree).find(n => n.type === 'Input' && n.props.placeholder?.startsWith('生活情境')).props.onInput({ detail: { value: '公园散步' } })
  tree = render(SavedPhraseManager, props)
  button(tree, '取消').props.onClick()
  expect(service.assignLifeContext).not.toHaveBeenCalled()
  tree = render(SavedPhraseManager, props)
  button(tree, '情境：散步').props.onClick()
  tree = render(SavedPhraseManager, props)
  nodes(tree).find(n => n.type === 'Input' && n.props.placeholder?.startsWith('生活情境')).props.onInput({ detail: { value: '公园散步' } })
  tree = render(SavedPhraseManager, props)
  button(tree, '保存情境').props.onClick()
  expect(service.assignLifeContext).toHaveBeenCalledWith('p0', '公园散步')
  expect(props.onItemsChange).toHaveBeenCalledWith([{ ...entries[0], lifeContext: '公园散步' }])
  expect(wechatSpeechPort.speak).not.toHaveBeenCalled()
  expect(props.onReuse).not.toHaveBeenCalled()
})
