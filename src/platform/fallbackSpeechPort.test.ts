import { describe, expect, test, vi } from 'vitest'

import { createFallbackSpeechPort } from './fallbackSpeechPort'
import type { SpeechPort, SpeechResult } from './speechPort'

function createPort(
  result: SpeechResult,
  available = true
): SpeechPort & {
  speak: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
} {
  return {
    available,
    speak: vi.fn(async () => result),
    stop: vi.fn()
  }
}

describe('fallback speech port', () => {
  test('keeps the WechatSI result when the plugin succeeds', async () => {
    const primary = createPort({ ok: true, message: '朗读完成。' })
    const fallback = createPort({ ok: true, message: '服务端完成。' })
    const port = createFallbackSpeechPort(primary, fallback)

    await expect(port.speak('我想喝水。')).resolves.toEqual({
      ok: true,
      message: '朗读完成。'
    })
    expect(fallback.speak).not.toHaveBeenCalled()
  })

  test('uses cboard-api only after the plugin fails', async () => {
    const primary = createPort({
      ok: false,
      message: '插件不可用。',
      reason: 'unavailable'
    })
    const fallback = createPort({ ok: true, message: '服务端完成。' })
    const port = createFallbackSpeechPort(primary, fallback)

    await expect(
      port.speak('需要帮助。', { rate: 1.2 })
    ).resolves.toEqual({
      ok: true,
      message: '微信语音暂不可用，已通过 cboard-api 完成朗读。'
    })
    expect(fallback.speak).toHaveBeenCalledWith('需要帮助。', {
      rate: 1.2
    })
  })

  test('never creates a paid fallback request for invalid text or a user stop', async () => {
    const fallback = createPort({ ok: true, message: '服务端完成。' })

    for (const result of [
      { ok: false, message: '没有文字。', reason: 'invalid' as const },
      { ok: false, message: '已停止。', reason: 'stopped' as const }
    ]) {
      const primary = createPort(result)
      const port = createFallbackSpeechPort(primary, fallback)
      await expect(port.speak('')).resolves.toEqual(result)
    }

    expect(fallback.speak).not.toHaveBeenCalled()
  })

  test('stops both providers and preserves both failure explanations', async () => {
    const primary = createPort({
      ok: false,
      message: '插件失败',
      reason: 'provider'
    })
    const fallback = createPort({
      ok: false,
      message: '登录后可使用服务端语音',
      reason: 'unavailable'
    })
    const port = createFallbackSpeechPort(primary, fallback)

    await expect(port.speak('请帮帮我。')).resolves.toEqual({
      ok: false,
      message: '插件失败；登录后可使用服务端语音',
      reason: 'unavailable'
    })
    port.stop()
    expect(primary.stop).toHaveBeenCalledOnce()
    expect(fallback.stop).toHaveBeenCalledOnce()
  })
})
