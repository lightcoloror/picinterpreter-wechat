import type {
  CboardAccountPort,
  CboardAccountSession
} from './cboardAccountPort'

export const ACCOUNT_DELETE_CONFIRMATION_TEXT = 'delete-account'

export interface AccountDeletionResult {
  deleted: boolean
  status: 'deleted' | 'cancelled' | 'failed'
  message: string
}

interface AccountDeletionDependencies {
  session: CboardAccountSession | null
  confirm: () => Promise<boolean>
  accountPort: Pick<CboardAccountPort, 'deleteAccount'>
  clearSession: () => void
}

export function isAccountDeletionConfirmation(value: string) {
  return value === ACCOUNT_DELETE_CONFIRMATION_TEXT
}

export async function executeCboardAccountDeletion({
  session,
  confirm,
  accountPort,
  clearSession
}: AccountDeletionDependencies): Promise<AccountDeletionResult> {
  if (!session || !session.token || !session.user.id) {
    return {
      deleted: false,
      status: 'failed',
      message: '请先登录，再删除云端账号。'
    }
  }

  let confirmed = false
  try {
    confirmed = await confirm()
  } catch (error) {
    return {
      deleted: false,
      status: 'failed',
      message: '无法打开删除确认，请稍后重试。'
    }
  }

  if (!confirmed) {
    return {
      deleted: false,
      status: 'cancelled',
      message: '已取消删除，账号和本机数据均未改变。'
    }
  }

  let remoteResult
  try {
    remoteResult = await accountPort.deleteAccount(
      session.token,
      session.user.id
    )
  } catch (error) {
    return {
      deleted: false,
      status: 'failed',
      message: '云端账号删除失败，本机数据和登录状态均未改变。'
    }
  }

  if (!remoteResult.ok) {
    return {
      deleted: false,
      status: 'failed',
      message: remoteResult.message
    }
  }

  try {
    clearSession()
  } catch (error) {
    return {
      deleted: true,
      status: 'deleted',
      message:
        `${remoteResult.message} 本机登录状态未能完整清理，请重启小程序；` +
        '本机图卡、家庭图片和沟通历史仍然保留。'
    }
  }

  return {
    deleted: true,
    status: 'deleted',
    message:
      `${remoteResult.message} ` +
      '本机图卡、家庭图片和沟通历史仍然保留。'
  }
}
