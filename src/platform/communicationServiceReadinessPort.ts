import {
  normalizeCommunicationServiceReadiness,
  type CommunicationServiceReadiness
} from '@cboard-communication-core/serviceReadiness'

export interface CommunicationServiceReadinessResult {
  ok: boolean
  message: string
  value?: CommunicationServiceReadiness
}

export interface CommunicationServiceReadinessPort {
  readonly configured: boolean
  check(): Promise<CommunicationServiceReadinessResult>
}

interface CommunicationServiceReadinessDependencies {
  apiBaseUrl: string
  request: (options: {
    url: string
    method: 'GET'
    header: Record<string, string>
  }) => Promise<{ statusCode: number; data: unknown }>
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function hasHttpOrigin(value: string) {
  return /^https?:\/\/[^/]+/i.test(value)
}

function getReadyMessage(value: CommunicationServiceReadiness) {
  return value.privatePictureLibrary === 'configured'
    ? 'cboard-api、数据库、通信索引和账号私有图库均已就绪。'
    : 'cboard-api、数据库和通信索引已就绪；账号私有图库云存储尚未配置，本机备份仍可使用。'
}

function getDegradedMessage(value: CommunicationServiceReadiness) {
  const issues: string[] = []
  if (value.database !== 'connected') issues.push('数据库未连接')
  if (value.communicationIndexes === 'building') {
    issues.push('通信索引正在建立')
  } else if (value.communicationIndexes !== 'ready') {
    issues.push('通信索引未就绪')
  }
  return issues.length
    ? `cboard-api 已响应，但${issues.join('、')}。离线沟通仍可使用。`
    : 'cboard-api 已响应，但尚未报告完整就绪状态。离线沟通仍可使用。'
}

export function createCommunicationServiceReadinessPort(
  dependencies: CommunicationServiceReadinessDependencies
): CommunicationServiceReadinessPort {
  const apiBaseUrl = normalizeBaseUrl(dependencies.apiBaseUrl)
  const configured = hasHttpOrigin(apiBaseUrl)

  return {
    configured,

    async check() {
      if (!configured) {
        return {
          ok: false,
          message: '尚未配置手机可访问的 HTTPS cboard-api；离线沟通仍可使用。'
        }
      }

      try {
        const response = await dependencies.request({
          url: apiBaseUrl + '/health',
          method: 'GET',
          header: { Accept: 'application/json' }
        })
        const value = normalizeCommunicationServiceReadiness(response.data)
        if (
          !value.recognized ||
          (response.statusCode !== 200 && response.statusCode !== 503)
        ) {
          return {
            ok: false,
            message: 'cboard-api 返回了无法识别的状态；离线沟通仍可使用。'
          }
        }

        return {
          ok: true,
          message: value.ready
            ? getReadyMessage(value)
            : getDegradedMessage(value),
          value
        }
      } catch (error) {
        return {
          ok: false,
          message: '无法连接 cboard-api；请检查 HTTPS 地址和微信服务器域名，离线沟通仍可使用。'
        }
      }
    }
  }
}
