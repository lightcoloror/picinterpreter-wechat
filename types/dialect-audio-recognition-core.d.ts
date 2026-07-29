declare module '@cboard-communication-core/dialectAudioRecognition' {
  export interface DialectAudioFileDescriptor {
    type?: unknown
    mimeType?: unknown
    size?: unknown
  }

  export interface DialectAudioValidationResult {
    valid: boolean
    message: string
    mimeType?: string
    voiceFormat?: string
  }

  export interface DialectAudioRecognitionResponse {
    text: string
    dialect: 'cantonese'
    engine: '16k_yue'
    provider: string
    audioDurationMs: number
    audioStored: false
    providerProcessing: true
  }

  export const MAX_DIALECT_AUDIO_BYTES: number
  export const MAX_DIALECT_AUDIO_DURATION_MS: number
  export const DIALECT_AUDIO_ENGINE: '16k_yue'
  export const DIALECT_AUDIO_TYPES: Readonly<Record<string, string>>

  export function validateDialectAudioFile(
    file: DialectAudioFileDescriptor
  ): DialectAudioValidationResult

  export function normalizeDialectAudioRecognitionResponse(
    value: unknown
  ): DialectAudioRecognitionResponse | null
}
