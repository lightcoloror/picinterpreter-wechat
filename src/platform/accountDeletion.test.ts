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

  return {
    deleteAccount,
    clearSession,
    confirm,
    run: (accountSession: CboardAccountSession | null = session) =>
      executeCboardAccountDeletion({
        session: accountSession,
        confirm,
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

  test('keeps the session when the remote account deletion fails', async () => {
    const harness = createHarness()
    harness.deleteAccount.mockResolvedValueOnce({
      ok: false,
      message: '服务器暂时不可用。'
    })

    const result = await harness.run()

    expect(result).toEqual({
      deleted: false,
      status: 'failed',
      message: '服务器暂时不可用。'
    })
    expect(harness.clearSession).not.toHaveBeenCalled()
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
