export interface PictogramImageViewState {
  source: string
  fallbackLabel: string
  showFallback: boolean
  canRetry: boolean
}

const DEFAULT_FALLBACK_LABEL = '图片暂不可用'

export function resolvePictogramImageViewState(
  source: string | undefined,
  failedSource: string,
  label: string | undefined
): PictogramImageViewState {
  const normalizedSource = String(source || '').trim()
  const normalizedFailedSource = String(failedSource || '').trim()
  const normalizedLabel = String(label || '').trim()
  const canRetry =
    normalizedSource.length > 0 &&
    normalizedSource === normalizedFailedSource

  return {
    source: normalizedSource,
    fallbackLabel: normalizedLabel || DEFAULT_FALLBACK_LABEL,
    showFallback: normalizedSource.length === 0 || canRetry,
    canRetry
  }
}
