import { describe, expect, test, vi } from 'vitest'

import { createCommunicationSharePort } from './communicationSharePort'

function createHarness() {
  const dependencies = {
    copyText: vi.fn().mockResolvedValue(undefined),
    renderReceiverImage: vi.fn().mockResolvedValue({
      path: 'wxfile://receiver-share.png',
      failedImageCount: 0
    }),
    shareImage: vi.fn().mockResolvedValue(undefined)
  }
  return {
    dependencies,
    port: createCommunicationSharePort(dependencies)
  }
}

describe('communication share port', () => {
  test('copies the selected expression without changing it', async () => {
    const harness = createHarness()

    await expect(
      harness.port.shareExpressionText('  我想喝水。  ')
    ).resolves.toEqual({
      ok: true,
      message: '句子已复制，可粘贴到微信或其他应用发送。'
    })
    expect(harness.dependencies.copyText).toHaveBeenCalledWith('我想喝水。')
  })

  test('renders and opens the native image share menu in sequence order', async () => {
    const harness = createHarness()
    const items = [
      { id: 'want', label: '想', image: '/want.png' },
      { id: 'water', label: '水', image: '/water.png' }
    ]

    const result = await harness.port.shareReceiverImage(items, {
      speechText: '我想喝水'
    })

    expect(result).toEqual({
      ok: true,
      value: 'wxfile://receiver-share.png',
      message: '图片分享菜单已打开。'
    })
    expect(
      harness.dependencies.renderReceiverImage
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        speechText: '我想喝水',
        items: [
          expect.objectContaining({ id: 'want' }),
          expect.objectContaining({ id: 'water' })
        ]
      })
    )
    expect(harness.dependencies.shareImage).toHaveBeenCalledWith(
      'wxfile://receiver-share.png'
    )
  })

  test('reports cancellation without retrying or changing communication data', async () => {
    const harness = createHarness()
    harness.dependencies.shareImage.mockRejectedValue({
      errMsg: 'showShareImageMenu:fail cancel'
    })

    await expect(
      harness.port.shareReceiverImage([
        { id: 'water', label: '水', image: '/water.png' }
      ])
    ).resolves.toEqual({
      ok: false,
      cancelled: true,
      message: '已取消分享。'
    })
    expect(harness.dependencies.renderReceiverImage).toHaveBeenCalledOnce()
  })
})
