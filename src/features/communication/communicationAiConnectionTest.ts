import type { CommunicationAiPort } from '../../platform/communicationAiPort'

type CommunicationAiConnectionTestPort = Pick<
  CommunicationAiPort,
  'generateSentences'
>

export interface CommunicationAiConnectionTestResult {
  ok: boolean
  message: string
}

interface CommunicationAiConnectionTestOptions {
  timeoutMs?: number
}

export const COMMUNICATION_AI_CONNECTION_TEST_TIMEOUT_MS = 10_000

const CONNECTION_TEST_LABELS = Object.freeze(['我', '喝水'])

class CommunicationAiConnectionTimeoutError extends Error {}

function waitForResult<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new CommunicationAiConnectionTimeoutError()),
      timeoutMs
    )

    promise.then(
      value => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      error => {
        clearTimeout(timeoutId)
        reject(error)
      }
    )
  })
}

export async function runCommunicationAiConnectionTest(
  port: CommunicationAiConnectionTestPort,
  options: CommunicationAiConnectionTestOptions = {}
): Promise<CommunicationAiConnectionTestResult> {
  const requestedTimeout = Number(options.timeoutMs)
  const timeoutMs =
    Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? Math.min(Math.round(requestedTimeout), 60_000)
      : COMMUNICATION_AI_CONNECTION_TEST_TIMEOUT_MS

  try {
    const result = await waitForResult(
      port.generateSentences({
        pictogramLabels: [...CONNECTION_TEST_LABELS],
        candidateCount: 1
      }),
      timeoutMs
    )
    if (!result.ok || !result.value) {
      return {
        ok: false,
        message: result.message || 'AI 真实连接测试失败，本地沟通仍可正常使用。'
      }
    }

    const candidate = String(result.value.candidates[0] || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 120)
    if (!candidate) {
      return {
        ok: false,
        message: 'AI 已响应但没有返回可用候选句，本地沟通仍可正常使用。'
      }
    }

    return {
      ok: true,
      message: `AI 真实连接成功：${candidate}`
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof CommunicationAiConnectionTimeoutError
          ? 'AI 真实连接测试等待超过 10 秒，请检查网络或服务商。本地沟通仍可正常使用。'
          : 'AI 真实连接测试失败，本地沟通仍可正常使用。'
    }
  }
}
