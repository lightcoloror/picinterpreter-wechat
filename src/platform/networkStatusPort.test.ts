import { describe, expect, test, vi } from 'vitest'

import {
  createNetworkStatusPort,
  type NetworkStatusChange
} from './networkStatusPort'

function createHarness(networkType = 'wifi') {
  let activeListener: ((change: NetworkStatusChange) => void) | null = null
  const getNetworkType = vi.fn(async () => ({ networkType }))
  const onNetworkStatusChange = vi.fn(
    (listener: (change: NetworkStatusChange) => void) => {
      activeListener = listener
    }
  )
  const offNetworkStatusChange = vi.fn()

  return {
    getNetworkType,
    onNetworkStatusChange,
    offNetworkStatusChange,
    emit(change: NetworkStatusChange) {
      activeListener?.(change)
    },
    port: createNetworkStatusPort({
      getNetworkType,
      onNetworkStatusChange,
      offNetworkStatusChange
    })
  }
}

describe('network status port', () => {
  test('reports a connected network as online', async () => {
    const harness = createHarness('wifi')

    await expect(harness.port.getCurrent()).resolves.toEqual({
      availability: 'online',
      networkType: 'wifi'
    })
  })

  test('reports the WeChat none network type as offline', async () => {
    const harness = createHarness('none')

    await expect(harness.port.getCurrent()).resolves.toEqual({
      availability: 'offline',
      networkType: 'none'
    })
  })

  test('does not claim the device is offline when the status API fails', async () => {
    const harness = createHarness()
    harness.getNetworkType.mockRejectedValueOnce(new Error('unavailable'))

    await expect(harness.port.getCurrent()).resolves.toEqual({
      availability: 'unknown',
      networkType: 'unknown'
    })
  })

  test('forwards network changes and removes the exact listener', () => {
    const harness = createHarness()
    const listener = vi.fn()
    const unsubscribe = harness.port.subscribe(listener)

    harness.emit({ isConnected: false, networkType: 'none' })

    expect(listener).toHaveBeenCalledWith({
      availability: 'offline',
      networkType: 'none'
    })

    const registeredListener =
      harness.onNetworkStatusChange.mock.calls[0][0]
    unsubscribe()
    expect(harness.offNetworkStatusChange).toHaveBeenCalledWith(
      registeredListener
    )
  })
})
