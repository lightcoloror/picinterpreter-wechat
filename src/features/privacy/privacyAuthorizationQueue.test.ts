import { describe, expect, test, vi } from 'vitest'

import { createPrivacyAuthorizationQueue } from './privacyAuthorizationQueue'

describe('privacy authorization queue', () => {
  test('reports exposure and resumes every pending call after explicit agreement', () => {
    const onPendingChange = vi.fn()
    const first = vi.fn()
    const second = vi.fn()
    const queue = createPrivacyAuthorizationQueue(onPendingChange)

    queue.enqueue(first)
    queue.enqueue(second)
    queue.settle('agree', 'privacy-authorize-agree')

    expect(first).toHaveBeenNthCalledWith(1, {
      event: 'exposureAuthorization'
    })
    expect(first).toHaveBeenNthCalledWith(2, {
      event: 'agree',
      buttonId: 'privacy-authorize-agree'
    })
    expect(second).toHaveBeenLastCalledWith({
      event: 'agree',
      buttonId: 'privacy-authorize-agree'
    })
    expect(onPendingChange).toHaveBeenLastCalledWith(false)
    expect(queue.pendingCount()).toBe(0)
  })

  test('rejects pending calls without an agreement button id', () => {
    const resolve = vi.fn()
    const queue = createPrivacyAuthorizationQueue(vi.fn())

    queue.enqueue(resolve)
    queue.settle('disagree')

    expect(resolve).toHaveBeenLastCalledWith({ event: 'disagree' })
    expect(queue.pendingCount()).toBe(0)
  })

  test('keeps the request pending when the exposure callback throws', () => {
    const resolve = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('platform unavailable')
      })
    const queue = createPrivacyAuthorizationQueue(vi.fn())

    queue.enqueue(resolve)

    expect(queue.pendingCount()).toBe(1)
  })
})
