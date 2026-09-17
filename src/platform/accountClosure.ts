import { createAccountClosure, type ClosureStorage } from '@cboard-communication-core/accountClosure'
import type { CboardAccountPort, CboardAccountSession, CboardApiResult } from './cboardAccountPort'

type ClosurePort = Pick<CboardAccountPort,
  'previewAccountClosure' | 'prepareAccountClosure' |
  'confirmAccountClosure' | 'getAccountClosureStatus'>

/** Reuse the shared durable workflow; this adapter never deletes local data or logs out. */
export function createMiniAccountClosure(options: {
  port: ClosurePort
  scope: string
  storage: ClosureStorage
  getSession(): CboardAccountSession | null
  preserveLocal(input: { owner: string; familyIds: string[] }): Promise<{ saved: boolean }>
}) {
  const identity = () => {
    const session = options.getSession()
    return session?.token && session.user.id ? session : null
  }
  const token = () => {
    const session = identity()
    if (!session) throw Object.assign(new Error('请先登录。'), { code: 'UNAUTHENTICATED', status: 401 })
    return session.token
  }
  async function value<T>(request: Promise<CboardApiResult<T>>): Promise<T> {
    let result: CboardApiResult<T>
    try { result = await request }
    catch (_) {
      // Transport errors can contain headers or request bodies. Do not propagate them.
      throw Object.assign(new Error('连接中断，请查询注销进度。'), { code: 'NETWORK_ERROR' })
    }
    if (!result.ok || result.value === undefined) {
      throw Object.assign(new Error('注销请求未完成，请查询进度。'), {
        code: result.code || 'INVALID_RESPONSE', status: result.status
      })
    }
    return result.value
  }
  return createAccountClosure({
    scope: options.scope,
    storage: options.storage,
    currentAccount: () => identity()?.user.id || null,
    preserveLocal: options.preserveLocal,
    api: {
      preview: () => value(options.port.previewAccountClosure(token())),
      prepare: () => value(options.port.prepareAccountClosure(token())),
      confirm: input => value(options.port.confirmAccountClosure(token(), input)),
      status: input => value(options.port.getAccountClosureStatus(input))
    }
  })
}
