import {
  createCommunicationSupportSettingsPatch,
  getCommunicationSupportSettings
} from '@cboard-communication-core/settingsAdapter'
import {
  buildCommunicationSupportCloudSettings,
  buildCommunicationSupportMergePreview,
  mergeCommunicationSupportSettings
} from '@cboard-communication-core/storage'
import {
  mergeConfirmedReceiverRecords,
  removeDeletedReceiverHistory
} from '@cboard-communication-core/receiverSync'
import {
  mergeVersionedCommunicationSavedPhrases,
  normalizeSavedPhraseTombstones
} from '@cboard-communication-core/savedPhraseSync'
import type {
  CommunicationHistoryEntry,
  CommunicationRepository,
  CommunicationSavedPhraseEntry
} from '@cboard-communication-core/repository'

import type {
  CboardAccountPort,
  CboardApiResult
} from './cboardAccountPort'

type CloudSyncRepository = Pick<
  CommunicationRepository,
  | 'loadCommunicationHistory'
  | 'loadCommunicationSavedPhraseTombstones'
  | 'loadCommunicationSavedPhrases'
  | 'loadReceiverRecords'
  | 'overwriteCommunicationHistory'
  | 'overwriteCommunicationSavedPhraseTombstones'
  | 'overwriteCommunicationSavedPhrases'
  | 'overwriteReceiverRecords'
  | 'retireAnonymousUserIdentity'
>

export interface CommunicationCloudSyncOptions {
  accountUserId?: string
}

export interface CommunicationCloudValue {
  savedPhrases: CommunicationSavedPhraseEntry[]
  history: CommunicationHistoryEntry[]
}

export interface CommunicationCloudSyncService {
  sync(
    token: string,
    options?: CommunicationCloudSyncOptions
  ): Promise<CboardApiResult<CommunicationCloudValue>>
  upload(
    token: string,
    options?: CommunicationCloudSyncOptions
  ): Promise<CboardApiResult<CommunicationCloudValue>>
  syncReceiverRecords(
    token: string
  ): Promise<
    CboardApiResult<CommunicationCloudValue> & {
      conflictCount?: number
    }
  >
  deleteReceiverRecords(
    token: string,
    recordIds: string[],
    options?: { deleteAll?: boolean }
  ): Promise<CboardApiResult<CommunicationCloudValue>>
}

type CommunicationReceiverSyncResult =
  CboardApiResult<CommunicationCloudValue> & {
    conflictCount: number
  }

type CommunicationSavedPhraseSyncResult =
  CboardApiResult<CommunicationCloudValue> & {
    conflictCount: number
  }

export function createCommunicationCloudSyncService(options: {
  repository: CloudSyncRepository
  settingsPort: Pick<
    CboardAccountPort,
    | 'getSettings'
    | 'updateSettings'
    | 'syncConfirmedReceiverRecords'
    | 'deleteConfirmedReceiverRecords'
    | 'syncCommunicationSavedPhrases'
    | 'deleteCommunicationSavedPhrases'
  >
}): CommunicationCloudSyncService {
  const getLocalValue = (): CommunicationCloudValue => ({
    savedPhrases: options.repository.loadCommunicationSavedPhrases(),
    history: options.repository.loadCommunicationHistory()
  })

  const overwriteLocalValue = (value: CommunicationCloudValue) => {
    options.repository.overwriteCommunicationSavedPhrases(value.savedPhrases)
    options.repository.overwriteCommunicationHistory(value.history)
    return getLocalValue()
  }

  const createCloudSettingsPatch = (value: CommunicationCloudValue) =>
    createCommunicationSupportSettingsPatch(
      buildCommunicationSupportCloudSettings(
        value.savedPhrases,
        value.history
      )
    )

  const retireAccountIdentity = (accountUserId = '') => {
    const normalizedAccountUserId = String(accountUserId || '').trim()
    if (!normalizedAccountUserId) {
      return { ok: true, retired: false }
    }
    try {
      const status =
        options.repository.retireAnonymousUserIdentity(
          normalizedAccountUserId
        )
      return {
        ok: status.status === 'retired',
        retired: status.status === 'retired'
      }
    } catch (error) {
      return { ok: false, retired: false }
    }
  }

  const syncSavedPhrases = async (
    token: string,
    legacySavedPhrases: CommunicationSavedPhraseEntry[] = []
  ): Promise<CommunicationSavedPhraseSyncResult> => {
    let tombstones =
      options.repository.loadCommunicationSavedPhraseTombstones()
    const pendingTombstones = tombstones.filter(
      item => item.pending === true
    )
    if (pendingTombstones.length) {
      const deletion =
        await options.settingsPort.deleteCommunicationSavedPhrases(
          token,
          pendingTombstones.map(item => item.id)
        )
      if (!deletion.ok || !deletion.value) {
        return {
          ok: false,
          message: deletion.message,
          conflictCount: 0
        }
      }
      tombstones = normalizeSavedPhraseTombstones([
        ...tombstones,
        ...deletion.value.deletedPhrases
      ])
      options.repository.overwriteCommunicationSavedPhraseTombstones(
        tombstones
      )
    }

    const localPhrases =
      options.repository.loadCommunicationSavedPhrases()
    const localIds = new Set(localPhrases.map(item => item.id))
    const localSentences = new Set(
      localPhrases.map(item =>
        String(item.sentence || '').trim().toLocaleLowerCase()
      )
    )
    const deletedIds = new Set(tombstones.map(item => item.id))
    const legacyAdditions = legacySavedPhrases.filter(item => {
      const sentence = String(item.sentence || '')
        .trim()
        .toLocaleLowerCase()
      return (
        !deletedIds.has(String(item.id || '')) &&
        !localIds.has(item.id) &&
        !localSentences.has(sentence)
      )
    })
    const seededPhrases = (
      mergeCommunicationSupportSettings(
        { savedPhrases: localPhrases, history: [] },
        { savedPhrases: legacyAdditions, history: [] }
      ) as CommunicationCloudValue
    ).savedPhrases
    const remote =
      await options.settingsPort.syncCommunicationSavedPhrases(
        token,
        seededPhrases
      )
    if (!remote.ok || !remote.value) {
      return {
        ok: false,
        message: remote.message,
        conflictCount: 0
      }
    }

    const merged = mergeVersionedCommunicationSavedPhrases(
      seededPhrases,
      remote.value.phrases,
      [...tombstones, ...remote.value.deletedPhrases]
    )
    options.repository.overwriteCommunicationSavedPhraseTombstones(
      merged.tombstones
    )
    options.repository.overwriteCommunicationSavedPhrases(merged.items)

    return {
      ok: true,
      message: remote.value.conflictCount
        ? `${remote.value.conflictCount} 个常用语版本冲突仍可继续核对。`
        : '常用语逐条版本已与云端同步。',
      conflictCount: Math.max(
        remote.value.conflictCount,
        merged.conflictCount
      ),
      value: getLocalValue()
    }
  }

  const syncReceiverRecords = async (
    token: string
  ): Promise<CommunicationReceiverSyncResult> => {
    const localRecords = options.repository.loadReceiverRecords()
    const remote = await options.settingsPort.syncConfirmedReceiverRecords(
      token,
      localRecords
    )
    if (!remote.ok || !remote.value) {
      return {
        ok: false,
        message: remote.message,
        conflictCount: 0
      }
    }
    const deletedRecords = remote.value.deletedRecords.length
      ? remote.value.deletedRecords
      : remote.value.deletedRecordIds

    const receiverRecords = mergeConfirmedReceiverRecords(
      localRecords,
      remote.value.records,
      deletedRecords
    )
    const activeHistory = removeDeletedReceiverHistory(
      getLocalValue().history,
      deletedRecords
    )
    const merged = mergeCommunicationSupportSettings(
      {
        savedPhrases: getLocalValue().savedPhrases,
        history: activeHistory
      },
      { savedPhrases: [], history: remote.value.records }
    ) as CommunicationCloudValue

    options.repository.overwriteReceiverRecords(receiverRecords)
    return {
      ok: true,
      message: remote.value.conflictCount
        ? `确认后的接收记录已合并；${remote.value.conflictCount} 个冲突保留服务端确认内容。`
        : '确认后的接收记录已与云端合并。',
      conflictCount: remote.value.conflictCount,
      value: overwriteLocalValue(merged)
    }
  }

  const deleteReceiverRecords = async (
    token: string,
    recordIds: string[],
    deleteOptions: { deleteAll?: boolean } = {}
  ): Promise<CboardApiResult<CommunicationCloudValue>> => {
    const remote = await options.settingsPort.deleteConfirmedReceiverRecords(
      token,
      recordIds,
      deleteOptions
    )
    if (!remote.ok || !remote.value) {
      return { ok: false, message: remote.message }
    }

    const localRecords = options.repository.loadReceiverRecords()
    const deletedRecordIds = deleteOptions.deleteAll
      ? localRecords.map(record => record.id).filter(Boolean) as string[]
      : remote.value.deletedRecordIds
    options.repository.overwriteReceiverRecords(
      mergeConfirmedReceiverRecords(localRecords, [], deletedRecordIds)
    )
    const localValue = getLocalValue()
    return {
      ok: true,
      message: '接收记录已删除，并会在其他设备同步移除。',
      value: overwriteLocalValue({
        ...localValue,
        history: removeDeletedReceiverHistory(
          localValue.history,
          deletedRecordIds
        )
      })
    }
  }

  return {
    deleteReceiverRecords,
    syncReceiverRecords,

    async sync(token, syncOptions = {}) {
      const remote = await options.settingsPort.getSettings(token)
      if (!remote.ok || !remote.value) {
        return { ok: false, message: remote.message }
      }

      const remoteValue = getCommunicationSupportSettings(remote.value)
      const safeRemoteValue = buildCommunicationSupportCloudSettings(
        remoteValue.savedPhrases,
        remoteValue.history
      )
      const mergePreview = buildCommunicationSupportMergePreview(
        getLocalValue(),
        safeRemoteValue
      )
      const merged = mergeCommunicationSupportSettings(
        { savedPhrases: [], history: getLocalValue().history },
        { savedPhrases: [], history: safeRemoteValue.history }
      ) as CommunicationCloudValue
      options.repository.overwriteCommunicationHistory(merged.history)
      const savedPhraseSync = await syncSavedPhrases(
        token,
        safeRemoteValue.savedPhrases
      )
      if (!savedPhraseSync.ok) {
        return {
          ok: false,
          message:
            `兼容历史已合并，但常用语仍留在本机：${savedPhraseSync.message}`,
          value: getLocalValue()
        }
      }
      const localValue = getLocalValue()
      const upload = await options.settingsPort.updateSettings(
        token,
        createCloudSettingsPatch(localValue)
      )
      const receiverSync = await syncReceiverRecords(token)

      if (!upload.ok) {
        return {
          ok: false,
          message: `云端数据已合并到本机，但回写失败：${upload.message}`,
          value: receiverSync.value || localValue
        }
      }

      if (!receiverSync.ok) {
        return {
          ok: false,
          message:
            `云端新增 ${mergePreview.remoteOnly} 条，本机上传 ${mergePreview.localOnly} 条，处理 ${mergePreview.conflicts} 个冲突；确认后的接收记录仍留在本机，稍后可重试。`,
          value: localValue
        }
      }

      const identity = retireAccountIdentity(
        syncOptions.accountUserId
      )
      if (!identity.ok) {
        return {
          ok: false,
          message:
            '数据已经同步，但本机匿名身份关联标记保存失败；请稍后再次同步。',
          value: receiverSync.value || localValue
        }
      }

      return {
        ok: true,
        message:
          `同步完成：云端新增 ${mergePreview.remoteOnly} 条，本机上传 ${mergePreview.localOnly} 条，处理 ${mergePreview.conflicts} 个设置冲突（本机保留 ${mergePreview.localWins} 个，云端较新 ${mergePreview.remoteWins} 个）；${savedPhraseSync.conflictCount} 个常用语版本冲突仍可核对，${receiverSync.conflictCount || 0} 个确认接收记录冲突保留服务端内容。${identity.retired ? ' 此设备的匿名身份已关联当前账号。' : ''}`,
        value: receiverSync.value || localValue
      }
    },

    async upload(token, syncOptions = {}) {
      const savedPhraseSync = await syncSavedPhrases(token)
      if (!savedPhraseSync.ok) {
        return {
          ok: false,
          message:
            `常用语仍留在本机，稍后可重试：${savedPhraseSync.message}`,
          value: getLocalValue()
        }
      }
      const localValue = getLocalValue()
      const upload = await options.settingsPort.updateSettings(
        token,
        createCloudSettingsPatch(localValue)
      )
      const receiverSync = await syncReceiverRecords(token)
      if (!upload.ok) {
        return {
          ok: false,
          message: upload.message,
          value: receiverSync.value || localValue
        }
      }
      if (receiverSync.ok) {
        const identity = retireAccountIdentity(
          syncOptions.accountUserId
        )
        if (!identity.ok) {
          return {
            ok: false,
            message:
              '数据已经上传，但本机匿名身份关联标记保存失败；请稍后再次同步。',
            value: receiverSync.value || localValue
          }
        }
      }
      return receiverSync.ok
        ? {
            ok: true,
            message:
              savedPhraseSync.conflictCount ||
              receiverSync.conflictCount
                ? `常用语和沟通历史已上传；${savedPhraseSync.conflictCount} 个常用语版本冲突仍可核对，${receiverSync.conflictCount} 个确认接收记录冲突保留服务端内容。`
                : '当前设备的常用语、沟通历史和确认后的接收记录已上传。',
            value: receiverSync.value || localValue
          }
        : {
            ok: false,
            message:
              '常用语和兼容历史已上传；确认后的接收记录仍留在本机，稍后可重试。',
            value: localValue
          }
    }
  }
}
