import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  playExpressionSentence as sharedPlay, stopExpressionPlayback as sharedStop
} from '@cboard-communication-core/expressionPlaybackCoordinator'
import {
  playExpressionSentence, stopExpressionPlayback
} from '../../features/communication/expressionPlaybackCoordinator'

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

    expect(workspace).toContain('playExpressionSentence')
    expect(workspace).toContain('stopExpressionPlayback')
    // The former local implementation is now the shared Web/mini coordinator.
    // Follow the import instead of requiring its old function body in this file.
    expect(playExpressionSentence).toBe(sharedPlay)
    expect(stopExpressionPlayback).toBe(sharedStop)
  })
})
