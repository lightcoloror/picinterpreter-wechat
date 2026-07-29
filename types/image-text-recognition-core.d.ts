declare module '@cboard-communication-core/imageTextRecognition' {
  export const IMAGE_TEXT_RECOGNITION_MAX_BYTES: number
  export const IMAGE_TEXT_RECOGNITION_MAX_CHARS: number
  export const IMAGE_TEXT_RECOGNITION_TYPES: readonly string[]

  export interface ImageTextRecognitionFile {
    type?: string
    size?: number
  }

  export interface ImageTextRecognitionValidation {
    valid: boolean
    code: string
    message: string
  }

  export interface ImageTextRecognitionResponse {
    text: string
    provider: string
    sourceStored: boolean
  }

  export function validateImageTextRecognitionFile(
    file?: ImageTextRecognitionFile
  ): ImageTextRecognitionValidation

  export function normalizeImageTextRecognitionResponse(
    value?: {
      text?: unknown
      provider?: unknown
      sourceStored?: unknown
    }
  ): ImageTextRecognitionResponse
}
