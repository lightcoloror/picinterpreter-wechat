import {
  MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS
} from '@cboard-communication-core/accountIdentity'
import type {
  CommunicationRepository
} from '@cboard-communication-core/repository'

import type {
  CboardAccountSession,
  CboardApiResult
} from './cboardAccountPort'
import type {
  CommunicationCloudSyncService,
  CommunicationCloudValue
} from './communicationCloudSync'

type AccountMergeRepository = Pick<
  CommunicationRepository,
  | 'deferAnonymousUserAccountMerge'
  | 'getAnonymousAccountMergeState'
  | 'loadCommunicationHistory'
  | 'loadCommunicationSavedPhrases'
  | 'loadPersonalImagePreferences'
  | 'loadReceiverCorrections'
  | 'loadReceiverRecords'
>

export interface AccountMergeSnapshot {
  savedPhraseCount: number
  historyCount: number
  confirmedReceiverCount: number
  privatePictogramCount: number
  correctionCount: number
}

export interface AccountMergeDialog {
  title: string
  content: string
  confirmText: string
  cancelText: string
}

export function createAccountMergeSnapshot(
  repository: AccountMergeRepository
): AccountMergeSnapshot {
  return {
    savedPhraseCount:
      repository.loadCommunicationSavedPhrases().length,
    historyCount: repository.loadCommunicationHistory().length,
    confirmedReceiverCount: repository
      .loadReceiverRecords()
      .filter(record => record.recordStatus === 'confirmed')
      .length,
    privatePictogramCount:
      repository.loadPersonalImagePreferences().length,
    correctionCount: repository.loadReceiverCorrections().length
  }
}

export function buildAccountMergeDialog(
  snapshot: AccountMergeSnapshot
): AccountMergeDialog {
  return {
    title: '将此设备的数据合并到账号吗？',
    content: [
      '此设备上保存了以下数据：',
      `- ${snapshot.savedPhraseCount} 条常用语`,
      `- ${snapshot.historyCount} 条文字历史`,
      `- ${snapshot.confirmedReceiverCount} 条确认接收记录`,
      `- ${snapshot.privatePictogramCount} 张私人图片（仅留本机）`,
      `- ${snapshot.correctionCount} 条家属修正（仅留本机）`,
      '',
      '确认后，公共常用语、文字历史和确认接收记录将合并到账号。',
      '私人图片和家属修正不会上传。'
    ].join('\n'),
    confirmText: '确认合并',
    cancelText: '暂时不用'
  }
}

export async function runPostLoginAccountMerge(options: {
  session: CboardAccountSession
  repository: AccountMergeRepository
  cloudSync: Pick<CommunicationCloudSyncService, 'sync'>
  confirm: (dialog: AccountMergeDialog) => Promise<boolean>
}): Promise<CboardApiResult<CommunicationCloudValue>> {
  const accountUserId = String(options.session.user.id || '').trim()
  if (!accountUserId) {
    return {
      ok: false,
      message: '登录响应缺少账号标识，本机数据尚未合并。'
    }
  }

  const mergeState =
    options.repository.getAnonymousAccountMergeState(accountUserId)
  if (mergeState.status === 'retired') {
    return options.cloudSync.sync(options.session.token, {
      accountUserId
    })
  }
  if (!mergeState.shouldPrompt) {
    return {
      ok: true,
      message:
        '已登录；此前已三次选择暂不合并，本机数据继续保留。可点击“立即同步”手动合并。'
    }
  }

  let confirmed = false
  try {
    confirmed = await options.confirm(
      buildAccountMergeDialog(
        createAccountMergeSnapshot(options.repository)
      )
    )
  } catch (error) {
    return {
      ok: false,
      message: '已登录，但无法显示合并确认；本机数据没有上传。'
    }
  }

  if (!confirmed) {
    try {
      const deferred =
        options.repository.deferAnonymousUserAccountMerge(accountUserId)
      const remaining = Math.max(
        0,
        MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS - deferred.promptCount
      )
      return {
        ok: true,
        message: remaining
          ? `已登录，暂未合并；本机数据保留。以后还会提示 ${remaining} 次。`
          : '已登录，暂未合并；以后不再自动提示，可随时点击“立即同步”。'
      }
    } catch (error) {
      return {
        ok: false,
        message: '已登录且没有上传，但暂缓状态保存失败；下次可能再次提示。'
      }
    }
  }

  return options.cloudSync.sync(options.session.token, {
    accountUserId
  })
}
