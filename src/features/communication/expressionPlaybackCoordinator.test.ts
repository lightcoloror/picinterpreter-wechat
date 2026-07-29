import { describe, expect, test, vi } from 'vitest'
import type { TileDTO } from '@cboard-communication-core/dto'

import type { AudioPlaybackPort } from '../../platform/audioPlaybackPort'
import type { SpeechPort } from '../../platform/speechPort'
import { playExpressionSentence } from './expressionPlaybackCoordinator'

function tile(
  id: string,
  label: string,
  sound = ''
): TileDTO {
  return {
    dtoType: 'TileDTO',
    version: 1,
    id,
    boardId: 'daily',
    label,
    vocalization: label,
    image: '',
    sound,
    backgroundColor: '',
    keyPath: '',
    loadBoardId: '',
    communication: {
      synonyms: [],
      excludeTokens: [],
      category: ''
    }
  }
}

function createPorts() {
  const calls: string[] = []
  const speechPort: SpeechPort = {
    available: true,
    speak: vi.fn(async text => {
      calls.push(`speech:${text}`)
      return { ok: true, message: 'spoken' }
    }),
    stop: vi.fn()
  }
  const audioPort: AudioPlaybackPort = {
    available: true,
    play: vi.fn(async source => {
      calls.push(`audio:${source}`)
      return { ok: true, message: 'played' }
    }),
    stop: vi.fn()
  }
  return { calls, speechPort, audioPort }
}

describe('expression playback coordinator', () => {
  test('reuses CBoard mixed TTS and recording order for the base sentence', async () => {
    const ports = createPorts()
    const output = [
      tile('i', '我'),
      tile('want', '想'),
      tile('water', '喝水', 'wxfile://personal/water.mp3'),
      tile('thanks', '谢谢')
    ]

    const result = await playExpressionSentence({
      sentence: '我想喝水谢谢。',
      output,
      ...ports,
      rate: 1.2
    })

    expect(result.ok).toBe(true)
    expect(ports.calls).toEqual([
      'speech:我 想',
      'audio:wxfile://personal/water.mp3',
      'speech:谢谢'
    ])
  })

  test('uses full-sentence TTS when AI changed the tile sentence', async () => {
    const ports = createPorts()
    await playExpressionSentence({
      sentence: '请帮我倒一杯温水。',
      output: [tile('water', '喝水', 'wxfile://personal/water.mp3')],
      ...ports
    })

    expect(ports.calls).toEqual(['speech:请帮我倒一杯温水。'])
  })

  test('falls back to the tile vocalization when a recording cannot play', async () => {
    const ports = createPorts()
    ports.audioPort.play = vi.fn(async source => {
      ports.calls.push(`audio:${source}`)
      return {
        ok: false,
        message: 'failed',
        reason: 'playback' as const
      }
    })

    const result = await playExpressionSentence({
      sentence: '喝水。',
      output: [tile('water', '喝水', 'wxfile://missing.mp3')],
      ...ports
    })

    expect(result.ok).toBe(true)
    expect(ports.calls).toEqual([
      'audio:wxfile://missing.mp3',
      'speech:喝水'
    ])
  })
})
