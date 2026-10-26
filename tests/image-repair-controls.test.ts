import { beforeEach, expect, test, vi } from 'vitest'
import ImageRepairControls from '../src/components/ImageRepairControls'
import { invalidateImageOperations } from '@cboard-communication-core/imageOperationEpoch'

const harness = vi.hoisted(() => ({
  slots: [] as any[], index: 0, effects: [] as (() => void)[],
  verify: vi.fn(), cache: vi.fn(), select: vi.fn()
}))
vi.mock('react', async () => ({
  ...await vi.importActual('react'),
  useState: (initial: any) => {
    const index = harness.index++
    if (!(index in harness.slots)) harness.slots[index] = initial
    return [harness.slots[index], (value: any) => {
      harness.slots[index] = typeof value === 'function' ? value(harness.slots[index]) : value
    }]
  },
  useRef: (initial: any) => {
    const index = harness.index++
    if (!(index in harness.slots)) harness.slots[index] = { current: initial }
    return harness.slots[index]
  },
  useEffect: (effect: () => any, dependencies: any[]) => {
    const index = harness.index++
    const previous = harness.slots[index]
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      harness.effects.push(() => {
        previous?.cleanup?.()
        harness.slots[index] = { dependencies, cleanup: effect() }
      })
    }
  }
}))
vi.mock('@tarojs/components', () => ({ Button: 'Button', Image: 'Image', View: 'View', Text: 'Text' }))
vi.mock('../src/platform/taroLocalImageVerification', () => ({ verifyTaroLocalImage: harness.verify }))
vi.mock('../src/platform/taroPersonalImagePort', () => ({ taroPersonalImagePort: { selectAndSave: harness.select } }))
vi.mock('../src/platform/taroPictogramSearchPort', () => ({ taroPictogramSearchPort: { cache: harness.cache } }))

const tile = { id: 'synthetic-a', label: '合成图卡', image: '/assets/synthetic.png' }
const props = () => ({ tile: { ...tile }, operationKey: 'synthetic-scope', onAdopt: vi.fn(), onKeepText: vi.fn() })
const nodes = (element: any): any[] => !element || typeof element !== 'object' ? []
  : [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]
const text = (tree: any) => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children).join(' ')
const button = (tree: any, label: string) => nodes(tree).find(node => node.type === 'Button' && node.props.children === label)
const render = (value: any) => {
  harness.index = 0
  const tree = ImageRepairControls(value)
  harness.effects.splice(0).forEach(effect => effect())
  return tree
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
const deferred = () => { let resolve: (value: any) => void = () => {}; const promise = new Promise<any>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => { harness.slots = []; harness.index = 0; harness.effects = []; vi.clearAllMocks(); harness.verify.mockResolvedValue({ status: 'available' }) })

test('local checking does not claim a missing original or start a download', async () => {
  const pending = deferred(); harness.verify.mockReturnValue(pending.promise)
  const value = props(); let tree = render(value)
  expect(text(tree)).toContain('正在检查本机图片')
  expect(text(tree)).not.toContain('缺失')
  expect(text(tree)).not.toContain('原素材无法可靠定位')
  expect(button(tree, '重新检查').props.disabled).toBe(true)
  pending.resolve({ status: 'check-failed' }); await settle(); tree = render(value)
  expect(text(tree)).toContain('检查失败')
  expect(text(tree)).toContain('没有可自动重新下载的公开素材标识')
  expect(harness.cache).not.toHaveBeenCalled(); expect(harness.select).not.toHaveBeenCalled()
})

test('rechecking immediately withdraws the old missing state until the new result', async () => {
  harness.verify.mockResolvedValueOnce({ status: 'missing' })
  const value = props(); render(value); await settle(); let tree = render(value)
  expect(text(tree)).toContain('本机图片缺失')
  const pending = deferred(); harness.verify.mockReturnValueOnce(pending.promise)
  button(tree, '重新检查').props.onClick(); tree = render(value)
  expect(text(tree)).toContain('正在检查本机图片')
  expect(text(tree)).not.toContain('本机图片缺失')
  pending.resolve({ status: 'available', width: 2, height: 2 }); await settle(); tree = render(value)
  expect(text(tree)).toContain('图片已核验可离线使用')
  expect(harness.cache).not.toHaveBeenCalled()
})

test('a late check cannot change the status of the next picture', async () => {
  const old = deferred(), next = deferred()
  harness.verify.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  const value = props(); render(value)
  const changed = { ...value, tile: { ...tile, image: '/assets/synthetic-next.png' } }
  render(changed); next.resolve({ status: 'available', width: 3, height: 3 }); await settle()
  old.resolve({ status: 'missing' }); await settle()
  expect(text(render(changed))).toContain('图片已核验可离线使用')
  expect(harness.cache).not.toHaveBeenCalled()
})

test('privacy clearing invalidates pending check results', async () => {
  const pending = deferred(); harness.verify.mockReturnValueOnce(pending.promise)
  const value = props(); render(value); invalidateImageOperations()
  pending.resolve({ status: 'available', width: 2, height: 2 }); await settle()
  expect(text(render(value))).not.toContain('图片已核验可离线使用')
  expect(value.onAdopt).not.toHaveBeenCalled()
})

test('unexpected local check rejection is explicit and keeps manual recovery available', async () => {
  harness.verify.mockRejectedValueOnce(new Error('synthetic read failure'))
  const value = props(); render(value); await settle(); const tree = render(value)
  expect(text(tree)).toContain('图片检查失败')
  expect(button(tree, '重新检查').props.disabled).toBe(false)
  expect(button(tree, '重新选择本机图片')).toBeTruthy()
  expect(harness.cache).not.toHaveBeenCalled()
})
