import { describe, expect, test, vi } from 'vitest'

import { createPreferredSpeechPort } from './preferredSpeechPort'

function createHarness(storedVoice = 'verse') {
  const delegate = {
    available: true,
    speak: vi.fn(async () => ({ ok: true, message: 'ok' })),
    stop: vi.fn()
  }
  return {
    delegate,
    port: createPreferredSpeechPort(delegate, () => storedVoice)
  }
}

describe('preferred speech port', () => {
  test('injects the stored voice into every ordinary speech request', async () => {
    const harness = createHarness()

    await harness.port.speak('我想喝水。', { rate: 1.2 })

    expect(harness.delegate.speak).toHaveBeenCalledWith('我想喝水。', {
      rate: 1.2,
      voice: 'verse'
    })
  })

  test('keeps an explicit preview voice ahead of the stored preference', async () => {
    const harness = createHarness('verse')

    await harness.port.speak('试听。', { voice: 'coral' })

    expect(harness.delegate.speak).toHaveBeenCalledWith('试听。', {
      voice: 'coral'
    })
  })

  test('omits voice when the server default is selected and forwards stop', async () => {
    const harness = createHarness('')

    await harness.port.speak('默认音色。')
    harness.port.stop()

    expect(harness.delegate.speak).toHaveBeenCalledWith('默认音色。', {})
    expect(harness.delegate.stop).toHaveBeenCalledOnce()
  })
})
