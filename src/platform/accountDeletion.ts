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
  confirmFamilyClose: (familyIds: string[]) => Promise<boolean>
  accountPort: Pick<CboardAccountPort, 'deleteAccount'>
  clearSession: () => void
}

export function isAccountDeletionConfirmation(value: string) {
  return value === ACCOUNT_DELETE_CONFIRMATION_TEXT
}

export async function executeCboardAccountDeletion({
  session,
  confirm,
  confirmFamilyClose,
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
      message: '已取消删除，没有继续关闭家庭；本机资料仍然保留。'
    }
  }

  let remoteResult
  try {
    remoteResult = await accountPort.deleteAccount(session.token, session.user.id)
  } catch (error) {
    return {
      deleted: false,
      status: 'failed',
      message: '云端账号删除状态未知；本机资料仍然保留，请重试。'
    }
  }

  if (
    !remoteResult.ok &&
    remoteResult.code === 'FAMILY_CLOSE_CONFIRMATION_REQUIRED' &&
    Array.isArray(remoteResult.familyIds) &&
    remoteResult.familyIds.length
  ) {
    let closeConfirmed = false
    try {
      closeConfirmed = await confirmFamilyClose(remoteResult.familyIds)
    } catch (error) {
      return {
        deleted: false,
        status: 'failed',
        message: '无法打开关闭家庭确认，请稍后重试。'
      }
    }
    if (!closeConfirmed) {
      return {
        deleted: false,
        status: 'cancelled',
        message: '已取消关闭家庭，没有继续删除；本机资料仍然保留。'
      }
    }
    try {
      remoteResult = await accountPort.deleteAccount(
        session.token,
        session.user.id,
        remoteResult.familyIds
      )
    } catch (error) {
      return {
        deleted: false,
        status: 'failed',
        message: '云端账号删除状态未知；本机资料仍然保留，请重试。'
      }
    }
  }

  if (!remoteResult.ok) {
    return {
      deleted: false,
      status: 'failed',
      message:
        remoteResult.code === 'FAMILY_TRANSFER_REQUIRED'
          ? '该账号仍管理其他家庭成员，请先交接家庭管理员权限；未继续删除，本机资料仍然保留。'
          : `云端账号删除未完成，状态可能正在处理；本机资料仍然保留，请重试。 ${remoteResult.message}`
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
