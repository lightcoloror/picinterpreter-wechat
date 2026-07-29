import { describe, expect, test, vi } from 'vitest'

import {
  APP_UPDATE_STATUS,
  createAppUpdatePort,
  type AppUpdateManager
} from './appUpdatePort'

function createManager() {
  let checkListener: ((result: { hasUpdate: boolean }) => void) | null = null
  let readyListener: (() => void) | null = null
  let failedListener: (() => void) | null = null
  const applyUpdate = vi.fn()
  const manager: AppUpdateManager = {
    applyUpdate,
    onCheckForUpdate(listener) {
      checkListener = listener
    },
    onUpdateReady(listener) {
      readyListener = listener
    },
    onUpdateFailed(listener) {
      failedListener = listener
    }
  }

  return {
    manager,
    applyUpdate,
    check(hasUpdate: boolean) {
      checkListener?.({ hasUpdate })
    },
    ready() {
      readyListener?.()
    },
    fail() {
      failedListener?.()
    }
  }
}

describe('app update port', () => {
  test('applies only a downloaded update', () => {
    const fake = createManager()
    const port = createAppUpdatePort(fake.manager)
    const statuses: string[] = []
    port.subscribe(status => statuses.push(status))

    expect(port.applyUpdate()).toBe(false)
    fake.check(true)
    expect(port.getStatus()).toBe(APP_UPDATE_STATUS.downloading)
    fake.ready()
    expect(port.getStatus()).toBe(APP_UPDATE_STATUS.ready)
    expect(port.applyUpdate()).toBe(true)
    expect(fake.applyUpdate).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['checking', 'downloading', 'ready'])
  })

  test('keeps failure and dismissal non-blocking', () => {
    const fake = createManager()
    const port = createAppUpdatePort(fake.manager)
    const listener = vi.fn()
    const unsubscribe = port.subscribe(listener)

    fake.check(true)
    fake.fail()
    expect(port.getStatus()).toBe(APP_UPDATE_STATUS.failed)

    fake.ready()
    port.dismiss()
    expect(port.getStatus()).toBe(APP_UPDATE_STATUS.idle)

    unsubscribe()
    fake.ready()
    expect(listener).toHaveBeenCalledTimes(5)
  })
})
