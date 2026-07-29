function parseErrorPayload(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch (error) {
    return null
  }
}

function getErrorCode(value: unknown) {
  const payload = parseErrorPayload(value)
  const error = payload && payload.error
  return error && typeof error === 'object' && !Array.isArray(error)
    ? String((error as Record<string, unknown>).code || '')
    : ''
}

export function getCommunicationEnhancementLimitMessage(
  statusCode: number,
  responseData: unknown,
  fallback: string
) {
  if (statusCode !== 429) return ''
  return [
    'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED',
    'COMMUNICATION_AI_TOKEN_QUOTA_EXCEEDED'
  ].includes(getErrorCode(responseData))
    ? `本月增强服务额度已用完；${fallback}`
    : `增强服务请求较多，请稍后重试；${fallback}`
}
