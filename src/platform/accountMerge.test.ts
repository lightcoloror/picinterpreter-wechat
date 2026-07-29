import { describe, expect, test, vi } from 'vitest'

import {
  buildAccountMergeDialog,
  createAccountMergeSnapshot,
  runPostLoginAccountMerge
} from './accountMerge'

function createHarness() {
  const repository = {
    loadCommunicationSavedPhrases: vi.fn(() => [{ id: 'phrase-1' }]),
    loadCommunicationHistory: vi.fn(() => [{ id: 'history-1' }]),
    loadReceiverRecords: vi.fn(() => [
      { id: 'receiver-1', recordStatus: 'confirmed' },
      { id: 'draft-1', recordStatus: 'draft' }
    ]),
    loadPersonalImagePreferences: vi.fn(() => [{ tileId: 'private-1' }]),
    loadReceiverCorrections: vi.fn(() => [{ id: 'correction-1' }]),
    getAnonymousAccountMergeState: vi.fn(() => ({
      anonymousUserId: 'anonymous-1',
      accountUserId: 'account-1',
      status: 'unlinked',
      promptCount: 0,
      retiredAt: null,
      shouldPrompt: true
    })),
    deferAnonymousUserAccountMerge: vi.fn(() => ({
      anonymousUserId: 'anonymous-1',
      accountUserId: 'account-1',
      status: 'deferred',
      promptCount: 1,
      retiredAt: null,
      shouldPrompt: true
    }))
  }
  const cloudSync = {
    sync: vi.fn(async () => ({
      ok: true,
      message: '同步完成',
      value: { savedPhrases: [], history: [] }
    }))
  }
  const session = {
    token: 'token-1',
    user: {
      id: 'account-1',
      name: '照护者',
      email: 'care@example.test'
    }
  }

  return { repository, cloudSync, session }
}

describe('post-login anonymous account merge', () => {
  test('shows accurate local counts and private-data boundaries', () => {
    const harness = createHarness()
    const snapshot = createAccountMergeSnapshot(harness.repository as never)
    const dialog = buildAccountMergeDialog(snapshot)

    expect(snapshot).toEqual({
      savedPhraseCount: 1,
      historyCount: 1,
      confirmedReceiverCount: 1,
      privatePictogramCount: 1,
      correctionCount: 1
    })
    expect(dialog.content).toContain('1 张私人图片（仅留本机）')
    expect(dialog.content).toContain('私人图片和家属修正不会上传')
  })

  test('keeps local data and records an explicit deferral', async () => {
    const harness = createHarness()
    const result = await runPostLoginAccountMerge({
      ...harness,
      repository: harness.repository as never,
      cloudSync: harness.cloudSync as never,
      confirm: vi.fn(async () => false)
    })

    expect(result.ok).toBe(true)
    expect(result.message).toContain('以后还会提示 2 次')
    expect(
      harness.repository.deferAnonymousUserAccountMerge
    ).toHaveBeenCalledWith('account-1')
    expect(harness.cloudSync.sync).not.toHaveBeenCalled()
  })

  test('stops automatic prompts after three deferrals', async () => {
    const harness = createHarness()
    harness.repository.getAnonymousAccountMergeState.mockReturnValueOnce({
      anonymousUserId: 'anonymous-1',
      accountUserId: 'account-1',
      status: 'deferred',
      promptCount: 3,
      retiredAt: null,
      shouldPrompt: false
    })
    const confirm = vi.fn(async () => true)
    const result = await runPostLoginAccountMerge({
      ...harness,
      repository: harness.repository as never,
      cloudSync: harness.cloudSync as never,
      confirm
    })

    expect(result.message).toContain('已三次选择暂不合并')
    expect(confirm).not.toHaveBeenCalled()
    expect(harness.cloudSync.sync).not.toHaveBeenCalled()
  })

  test('syncs confirmed or previously retired identities with the account id', async () => {
    const harness = createHarness()
    const confirmed = await runPostLoginAccountMerge({
      ...harness,
      repository: harness.repository as never,
      cloudSync: harness.cloudSync as never,
      confirm: vi.fn(async () => true)
    })

    expect(confirmed.ok).toBe(true)
    expect(harness.cloudSync.sync).toHaveBeenCalledWith('token-1', {
      accountUserId: 'account-1'
    })

    harness.cloudSync.sync.mockClear()
    harness.repository.getAnonymousAccountMergeState.mockReturnValueOnce({
      anonymousUserId: 'anonymous-1',
      accountUserId: 'account-1',
      status: 'retired',
      promptCount: 0,
      retiredAt: 10,
      shouldPrompt: false
    })
    const confirm = vi.fn(async () => false)
    await runPostLoginAccountMerge({
      ...harness,
      repository: harness.repository as never,
      cloudSync: harness.cloudSync as never,
      confirm
    })

    expect(confirm).not.toHaveBeenCalled()
    expect(harness.cloudSync.sync).toHaveBeenCalledWith('token-1', {
      accountUserId: 'account-1'
    })
  })
})
