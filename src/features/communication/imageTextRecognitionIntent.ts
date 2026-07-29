import { normalizeImageTextRecognitionResponse } from '@cboard-communication-core/imageTextRecognition'

export const IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY =
  'picinterpreter.communication.image-text-intent.v1'
export const IMAGE_TEXT_RECOGNITION_INTENT_MAX_AGE_MS = 15 * 60 * 1000

export interface ImageTextRecognitionIntent {
  id: string
  text: string
  createdAt: number
}

export interface ImageTextRecognitionIntentStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
}

function parseStoredValue(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

export function normalizeImageTextRecognitionIntent(
  value: unknown,
  now = Date.now()
): ImageTextRecognitionIntent | null {
  const parsed = parseStoredValue(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const candidate = parsed as Record<string, unknown>
  const id = String(candidate.id || '').trim().slice(0, 128)
  const text = normalizeImageTextRecognitionResponse({
    text: candidate.text
  }).text.slice(0, 80)
  const createdAt = Number(candidate.createdAt)

  if (!id || !text || !Number.isFinite(createdAt)) return null
  if (createdAt > now + 60_000) return null
  if (now - createdAt > IMAGE_TEXT_RECOGNITION_INTENT_MAX_AGE_MS) return null

  return { id, text, createdAt }
}

export function createImageTextRecognitionIntentStore(
  storage: ImageTextRecognitionIntentStorage,
  options: { now?: () => number } = {}
) {
  const now = options.now || Date.now

  return {
    save(value: ImageTextRecognitionIntent) {
      const normalized = normalizeImageTextRecognitionIntent(value, now())
      if (!normalized) return false
      try {
        storage.setStorageSync(
          IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY,
          normalized
        )
        return true
      } catch (error) {
        return false
      }
    },
    take() {
      let value: unknown = null
      try {
        value = storage.getStorageSync(
          IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY
        )
      } catch (error) {
        value = null
      }
      try {
        storage.removeStorageSync(IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY)
      } catch (error) {
        // A failed cleanup must not hide a valid recognition result.
      }
      return normalizeImageTextRecognitionIntent(value, now())
    }
  }
}
