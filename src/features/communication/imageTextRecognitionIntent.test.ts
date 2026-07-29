import { describe, expect, test } from 'vitest'

import {
  IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY,
  createImageTextRecognitionIntentStore
} from './imageTextRecognitionIntent'

function createHarness(initialValue?: unknown) {
  const values = new Map<string, unknown>()
  if (initialValue !== undefined) {
    values.set(IMAGE_TEXT_RECOGNITION_INTENT_STORAGE_KEY, initialValue)
  }
  return {
    values,
    store: createImageTextRecognitionIntentStore(
      {
        getStorageSync: key => values.get(key),
        setStorageSync: (key, value) => values.set(key, value),
        removeStorageSync: key => values.delete(key)
      },
      { now: () => 1_000_000 }
    )
  }
}

describe('imageTextRecognitionIntent', () => {
  test('normalizes and returns an OCR result only once', () => {
    const { store, values } = createHarness()

    expect(
      store.save({
        id: 'ocr-1',
        text: '  我想\n喝水  ',
        createdAt: 1_000_000
      })
    ).toBe(true)
    expect(store.take()).toEqual({
      id: 'ocr-1',
      text: '我想 喝水',
      createdAt: 1_000_000
    })
    expect(store.take()).toBeNull()
    expect(values.size).toBe(0)
  })

  test('drops stale and malformed intents before they can change the receiver', () => {
    const { store, values } = createHarness({
      id: 'ocr-stale',
      text: '过期文字',
      createdAt: 1
    })

    expect(store.take()).toBeNull()
    expect(values.size).toBe(0)
    expect(
      store.save({ id: '', text: '', createdAt: 1_000_000 })
    ).toBe(false)
  })
})
