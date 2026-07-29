import { describe, expect, it } from 'vitest'

import { resolvePictogramImageViewState } from './pictogramImageState'

describe('resolvePictogramImageViewState', () => {
  it('shows a readable fallback for an empty source', () => {
    expect(resolvePictogramImageViewState('  ', '', '喝水')).toEqual({
      source: '',
      fallbackLabel: '喝水',
      showFallback: true,
      canRetry: false
    })
  })

  it('shows the fallback only for the source that failed', () => {
    const failedSource = 'https://example.test/failed.png'

    expect(
      resolvePictogramImageViewState(failedSource, failedSource, '苹果')
    ).toMatchObject({ showFallback: true, canRetry: true })
    expect(
      resolvePictogramImageViewState(
        'https://example.test/recovered.png',
        failedSource,
        '苹果'
      )
    ).toMatchObject({ showFallback: false, canRetry: false })
  })

  it('uses a neutral fallback label when the tile has no label', () => {
    expect(resolvePictogramImageViewState('', '', ' ').fallbackLabel).toBe(
      '图片暂不可用'
    )
  })
})
