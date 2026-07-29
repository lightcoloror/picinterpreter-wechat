import { describe, expect, test } from 'vitest'

import {
  buildSpeechVoiceOptions,
  resolveSpeechVoiceSelection
} from './speechVoiceCatalog'

describe('speech voice catalog', () => {
  test('keeps the server default first and recognizes original presets', () => {
    expect(
      buildSpeechVoiceOptions(
        'FunAudioLLM/CosyVoice2-0.5B:claire',
        [
          'FunAudioLLM/CosyVoice2-0.5B:anna',
          'FunAudioLLM/CosyVoice2-0.5B:claire'
        ]
      )
    ).toEqual([
      {
        id: 'FunAudioLLM/CosyVoice2-0.5B:claire',
        label: 'Claire',
        description: '温柔女声',
        isDefault: true
      },
      {
        id: 'FunAudioLLM/CosyVoice2-0.5B:anna',
        label: 'Anna',
        description: '稳重女声',
        isDefault: false
      }
    ])
  })

  test('shows unknown provider voices by their public id', () => {
    expect(buildSpeechVoiceOptions('alloy', ['alloy', 'verse'])[1]).toEqual({
      id: 'verse',
      label: 'verse',
      description: '服务端允许音色',
      isDefault: false
    })
  })

  test('falls back when a stored voice is no longer allowed', () => {
    expect(
      resolveSpeechVoiceSelection('removed', 'alloy', ['alloy', 'verse'])
    ).toEqual(
      expect.objectContaining({
        selectedVoice: 'alloy',
        resetToDefault: true
      })
    )
  })
})
