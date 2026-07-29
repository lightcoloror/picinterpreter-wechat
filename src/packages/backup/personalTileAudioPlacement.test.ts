import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function readSource(name: string) {
  return readFileSync(new URL(name, import.meta.url), 'utf8')
}

describe('personal tile audio placement', () => {
  test('keeps recording controls in the caregiver picture editor', () => {
    const editor = readSource('./CustomPictogramEditor.tsx')

    expect(editor).toContain('taroTileAudioRecordingPort')
    expect(editor).toContain('custom-pictogram-record-sound-button')
    expect(editor).toContain('custom-pictogram-play-sound-button')
    expect(editor).toContain('custom-pictogram-clear-sound-button')
    expect(editor).toContain('draftSoundRegistryRef.current.commit')
    expect(editor).toContain('draftSoundRegistryRef.current.discardAll')
  })

  test('reuses the mixed CBoard recording and TTS playback pipeline', () => {
    const workspace = readSource(
      '../../features/communication/ExpressionWorkspace.tsx'
    )
    const playback = readSource(
      '../../features/communication/expressionPlaybackCoordinator.ts'
    )

    expect(workspace).toContain('playExpressionSentence')
    expect(workspace).toContain('stopExpressionPlayback')
    expect(playback).toContain('createExpressionPlaybackFrames')
    expect(playback).toContain('clip.fallbackText')
  })
})
