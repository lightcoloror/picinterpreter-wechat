import { describe, expect, test, vi } from 'vitest'

import type { CboardAccountSession } from './cboardAccountPort'
import {
  ACCOUNT_DELETE_CONFIRMATION_TEXT,
  executeCboardAccountDeletion,
  isAccountDeletionConfirmation
} from './accountDeletion'

const session: CboardAccountSession = {
  token: 'secret-token',
  user: {
    id: 'user-1',
    name: '照护者',
    email: 'care@example.test'
  }
}

function createHarness() {
  const deleteAccount = vi.fn(async () => ({
    ok: true,
    message: 'CBoard 云端账号已永久删除。',
    value: { accountId: 'user-1' }
  }))
  const clearSession = vi.fn()
  const confirm = vi.fn(async () => true)
  const confirmFamilyClose = vi.fn(async () => true)

  return {
    deleteAccount,
    clearSession,
    confirm,
    confirmFamilyClose,
    run: (accountSession: CboardAccountSession | null = session) =>
      executeCboardAccountDeletion({
        session: accountSession,
        confirm,
        confirmFamilyClose,
        accountPort: { deleteAccount },
        clearSession
      })
  }
}

describe('account deletion', () => {
  test('requires the exact explicit confirmation text', () => {
    expect(isAccountDeletionConfirmation(ACCOUNT_DELETE_CONFIRMATION_TEXT))
      .toBe(true)
    expect(isAccountDeletionConfirmation('delete account')).toBe(false)
    expect(isAccountDeletionConfirmation(' delete-account ')).toBe(false)
  })

  test('does not ask or request deletion without a complete session', async () => {
    const harness = createHarness()

    const result = await harness.run(null)

    expect(result).toEqual(expect.objectContaining({
      deleted: false,
      status: 'failed'
    }))
    expect(harness.confirm).not.toHaveBeenCalled()
    expect(harness.deleteAccount).not.toHaveBeenCalled()
    expect(harness.clearSession).not.toHaveBeenCalled()
  })

  test('cancels without changing the remote account or local session', async () => {
    const harness = createHarness()
    harness.confirm.mockResolvedValueOnce(false)

    const result = await harness.run()

    expect(result.status).toBe('cancelled')
    expect(harness.deleteAccount).not.toHaveBeenCalled()
    expect(harness.clearSession).not.toHaveBeenCalled()
  })

  test('keeps the session when the remote account deletion status is unknown', async () => {
    const harness = createHarness()
    harness.deleteAccount.mockResolvedValueOnce({
      ok: false,
      message: '服务器暂时不可用。'
    })

    const result = await harness.run()

    expect(result).toEqual({
      deleted: false,
      status: 'failed',
      message: '云端账号删除未完成，状态可能正在处理；本机资料仍然保留，请重试。 服务器暂时不可用。'
    })
    expect(harness.clearSession).not.toHaveBeenCalled()
  })

  test('requires a separate explicit family-close confirmation and submits returned ids only', async () => {
    const harness = createHarness()
    harness.deleteAccount
      .mockResolvedValueOnce({
        ok: false,
        code: 'FAMILY_CLOSE_CONFIRMATION_REQUIRED',
        familyIds: ['family-1'],
        message: '需要确认关闭家庭。'
      })
      .mockResolvedValueOnce({
        ok: true,
        message: 'CBoard 云端账号已永久删除。',
        value: { accountId: 'user-1' }
      })

    const result = await harness.run()

    expect(result.deleted).toBe(true)
    expect(harness.confirmFamilyClose).toHaveBeenCalledWith(['family-1'])
    expect(harness.deleteAccount).toHaveBeenNthCalledWith(
      2,
      'secret-token',
      'user-1',
      ['family-1']
    )
    expect(harness.clearSession).toHaveBeenCalledTimes(1)
  })

  test('does not retry or delete when family-close confirmation is cancelled', async () => {
    const harness = createHarness()
    harness.confirmFamilyClose.mockResolvedValueOnce(false)
    harness.deleteAccount.mockResolvedValueOnce({
      ok: false,
      code: 'FAMILY_CLOSE_CONFIRMATION_REQUIRED',
      familyIds: ['family-1'],
      message: '需要确认关闭家庭。'
    })

    const result = await harness.run()

    expect(result.status).toBe('cancelled')
    expect(harness.deleteAccount).toHaveBeenCalledTimes(1)
    expect(harness.clearSession).not.toHaveBeenCalled()
  })

  test('shows transfer guidance without retrying deletion', async () => {
    const harness = createHarness()
    harness.deleteAccount.mockResolvedValueOnce({
      ok: false,
      code: 'FAMILY_TRANSFER_REQUIRED',
      message: '需要交接家庭管理员。'
    })

    const result = await harness.run()

    expect(result).toEqual({
      deleted: false,
      status: 'failed',
      message: '该账号仍管理其他家庭成员，请先交接家庭管理员权限；未继续删除，本机资料仍然保留。'
    })
    expect(harness.deleteAccount).toHaveBeenCalledTimes(1)
  })

  test('clears only the account session after remote deletion succeeds', async () => {
    const harness = createHarness()
    const localCommunication = {
      history: ['想喝水'],
      personalImages: ['family-cup.png']
    }

    const result = await harness.run()

    expect(result).toEqual(expect.objectContaining({
      deleted: true,
      status: 'deleted',
      message: expect.stringContaining('本机图卡、家庭图片和沟通历史仍然保留')
    }))
    expect(harness.deleteAccount).toHaveBeenCalledWith(
      'secret-token',
      'user-1'
    )
    expect(harness.clearSession).toHaveBeenCalledTimes(1)
    expect(localCommunication).toEqual({
      history: ['想喝水'],
      personalImages: ['family-cup.png']
    })
  })

  test('reports a deleted account even if local session cleanup throws', async () => {
    const harness = createHarness()
    harness.clearSession.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })

    const result = await harness.run()

    expect(result).toEqual(expect.objectContaining({
      deleted: true,
      status: 'deleted',
      message: expect.stringContaining('请重启小程序')
    }))
  })
})
