export interface SpeechVoiceOption {
  id: string
  label: string
  description: string
  isDefault: boolean
}

const PRESET_DETAILS: Record<
  string,
  { label: string; description: string }
> = {
  anna: { label: 'Anna', description: '稳重女声' },
  bella: { label: 'Bella', description: '热情女声' },
  claire: { label: 'Claire', description: '温柔女声' },
  diana: { label: 'Diana', description: '活泼女声' },
  alex: { label: 'Alex', description: '稳重男声' },
  benjamin: { label: 'Benjamin', description: '低沉男声' },
  charles: { label: 'Charles', description: '磁性男声' },
  david: { label: 'David', description: '活泼男声' }
}

function normalizeVoiceList(defaultVoice: string, voices: string[]) {
  const seen = new Set<string>()
  return [defaultVoice, ...(Array.isArray(voices) ? voices : [])]
    .map(item => String(item || '').trim().slice(0, 80))
    .filter(item => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
    .slice(0, 20)
}

export function buildSpeechVoiceOptions(
  defaultVoice: string,
  voices: string[]
): SpeechVoiceOption[] {
  const normalizedDefault = String(defaultVoice || '').trim().slice(0, 80)
  return normalizeVoiceList(normalizedDefault, voices).map(id => {
    const voiceParts = id.split(':')
    const presetId = String(
      voiceParts[voiceParts.length - 1] || ''
    ).toLocaleLowerCase()
    const preset = PRESET_DETAILS[presetId]
    return {
      id,
      label: preset ? preset.label : id,
      description: preset
        ? preset.description
        : id === normalizedDefault
          ? '服务端默认音色'
          : '服务端允许音色',
      isDefault: id === normalizedDefault
    }
  })
}

export function resolveSpeechVoiceSelection(
  preferredVoice: string,
  defaultVoice: string,
  voices: string[]
) {
  const options = buildSpeechVoiceOptions(defaultVoice, voices)
  const preferred = String(preferredVoice || '').trim()
  const selected = options.find(option => option.id === preferred)
  const defaultOption = options.find(option => option.isDefault)
  const firstOption = options.length ? options[0] : null
  return {
    options,
    selectedVoice:
      (selected && selected.id) ||
      (defaultOption && defaultOption.id) ||
      (firstOption && firstOption.id) ||
      '',
    resetToDefault: Boolean(preferred && !selected)
  }
}
