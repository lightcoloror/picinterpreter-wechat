import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  PICTURE_LIBRARY_CONFLICT_STRATEGIES,
  type PictureLibraryArchiveScope,
  type PictureLibraryConflictStrategy,
  type PictureLibraryProgress
} from '@cboard-communication-core/pictureLibraryArchive'
import { validatePrivateArchivePassphrase } from '@cboard-communication-core/privateArchivePassphrase'

import { createTaroCommunicationRepository } from '../../../../platform/taroCommunicationRepository'
import { taroCboardSessionStore } from '../../../../platform/taroCboardAccountPort'
import { taroLocalDeviceDataPort } from '../../../../platform/taroLocalDeviceDataPort'
import { taroPictogramOrderingStore } from '../../../../platform/taroPictogramOrderingStore'
import { taroPictureLibraryArchivePort } from '../../../../platform/taroPictureLibraryArchivePort'
import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import {
  taroPrivateDeviceDataCloudPort,
  taroPrivatePictureLibraryCloudPort
} from '../../../../platform/taroPrivatePictureLibraryCloudPort'
import {
  decryptPrivateArchiveData,
  describePrivateArchiveEncryptionError,
  encryptPrivateArchiveData
} from '../../../../platform/taroPrivateArchiveEncryption'
import type {
  PrivatePictureLibraryMetadata
} from '../../../../platform/privatePictureLibraryCloudPort'
import { createPictureLibraryBackupService } from '../../pictureLibraryBackupService'
import './index.css'

const backupService = createPictureLibraryBackupService({
  repository: createTaroCommunicationRepository(),
  boardStore: taroPictureLibraryStore,
  orderingStore: taroPictogramOrderingStore,
  archivePort: taroPictureLibraryArchivePort,
  localDeviceDataPort: taroLocalDeviceDataPort
})

function formatCloudDate(value: number) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '时间未知'
    : date.toLocaleString('zh-CN', { hour12: false })
}

function formatCloudSize(value: number) {
  return `${Math.max(0, value / 1024 / 1024).toFixed(2)} MiB`
}

export default function PictureLibraryBackupPage() {
  const [scope, setScope] = useState<PictureLibraryArchiveScope>(
    PICTURE_LIBRARY_ARCHIVE_SCOPES.custom
  )
  const [conflictStrategy, setConflictStrategy] =
    useState<PictureLibraryConflictStrategy>(
      PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
    )
  const [busy, setBusy] =
    useState<
      | 'export'
      | 'import'
      | 'reset'
      | 'device-export'
      | 'cloud-upload'
      | 'cloud-download'
      | 'cloud-delete'
      | 'device-cloud-upload'
      | 'device-cloud-download'
      | 'device-cloud-delete'
      | 'private-clear'
      | 'all-clear'
      | null
    >(null)
  const [progress, setProgress] =
    useState<PictureLibraryProgress | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeOk, setNoticeOk] = useState(false)
  const [accountSession, setAccountSession] = useState(
    taroCboardSessionStore.load()
  )
  const [cloudMetadata, setCloudMetadata] =
    useState<PrivatePictureLibraryMetadata | null>(null)
  const [deviceCloudMetadata, setDeviceCloudMetadata] =
    useState<PrivatePictureLibraryMetadata | null>(null)
  const [privateLibraryPassphrase, setPrivateLibraryPassphrase] =
    useState('')
  const [privateLibraryPassphraseConfirmation,
    setPrivateLibraryPassphraseConfirmation] = useState('')
  const [privateDeviceDataPassphrase, setPrivateDeviceDataPassphrase] =
    useState('')
  const [privateDeviceDataPassphraseConfirmation,
    setPrivateDeviceDataPassphraseConfirmation] = useState('')

  const passphraseValidation = validatePrivateArchivePassphrase(
    privateDeviceDataPassphrase
  )
  const completePassphraseValidation = validatePrivateArchivePassphrase(
    privateDeviceDataPassphrase,
    privateDeviceDataPassphraseConfirmation
  )
  const privateLibraryPassphraseValidation =
    validatePrivateArchivePassphrase(privateLibraryPassphrase)
  const completePrivateLibraryPassphraseValidation =
    validatePrivateArchivePassphrase(
      privateLibraryPassphrase,
      privateLibraryPassphraseConfirmation
    )
  const clearPrivateLibraryPassphrase = () => {
    setPrivateLibraryPassphrase('')
    setPrivateLibraryPassphraseConfirmation('')
  }
  const clearPrivateDeviceDataPassphrase = () => {
    setPrivateDeviceDataPassphrase('')
    setPrivateDeviceDataPassphraseConfirmation('')
  }

  useDidShow(() => {
    setAccountSession(taroCboardSessionStore.load())
  })

  const finish = (result: { ok: boolean; message: string }) => {
    setNotice(result.message)
    setNoticeOk(result.ok)
    setBusy(null)
  }

  const exportArchive = async () => {
    if (busy) return
    setBusy('export')
    setNotice('')
    setProgress(null)
    finish(await backupService.exportArchive(scope, setProgress))
  }

  const importArchive = async () => {
    if (busy) return
    const confirmation = await Taro.showModal({
      title: '恢复图库或本机备份',
      content:
        conflictStrategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
          ? '相同 ID 将以备份内容为准；本机其他内容会保留。选择完整本机数据 ZIP 时，也会恢复常用语、沟通与接收记录。'
          : '相同 ID 将保留本机内容；只补充本机缺少的内容。选择完整本机数据 ZIP 时，也会补充常用语、沟通与接收记录。',
      confirmText: '选择 ZIP',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('import')
    setNotice('')
    setProgress(null)
    finish(
      await backupService.importArchive(
        conflictStrategy,
        setProgress
      )
    )
  }

  const openAacImportPage = () => {
    if (busy) return
    void Taro.navigateTo({
      url: '/packages/aac-import/pages/index/index'
    })
  }

  const resetLibrary = async () => {
    if (busy) return
    const confirmation = await Taro.showModal({
      title: '恢复默认 CBoard 图库',
      content:
        '当前沟通板将恢复为应用内置版本。个人替换图片、已确认补图、沟通历史和账号设置都会保留；建议先生成完整图库 ZIP。',
      confirmText: '恢复默认',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('reset')
    setNotice('')
    setProgress(null)
    finish(backupService.resetToDefaults())
  }

  const exportDeviceData = async () => {
    if (busy) return
    setBusy('device-export')
    setNotice('')
    setProgress(null)
    finish(await backupService.exportDeviceDataArchive(setProgress))
  }

  const uploadPrivateLibrary = async () => {
    if (busy) return
    if (!completePrivateLibraryPassphraseValidation.ok) {
      finish({
        ok: false,
        message: completePrivateLibraryPassphraseValidation.message
      })
      return
    }
    const session = taroCboardSessionStore.load()
    setAccountSession(session)
    if (!session) {
      finish({
        ok: false,
        message: '请先在照护者设置中登录 CBoard 账号。'
      })
      return
    }
    const confirmation = await Taro.showModal({
      title: '备份私人图片到账号',
      content:
        '只备份个人替换图和已确认补图，不上传完整沟通板、语音或沟通历史。图片会先在本机使用恢复密码加密，服务端只保存密文。忘记密码后无法恢复。',
      confirmText: '生成并上传',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('cloud-upload')
    setNotice('')
    setProgress(null)
    const built = await backupService.buildArchive(
      PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
      setProgress
    )
    if (!built.ok || !built.archive) {
      finish(built)
      return
    }
    if (!(built.summary && built.summary.customPictureCount)) {
      finish({
        ok: false,
        message: '当前没有个人替换图或已确认补图，不需要上传云端备份。'
      })
      return
    }

    try {
      const encrypted = await encryptPrivateArchiveData(
        built.archive.data,
        completePrivateLibraryPassphraseValidation.passphrase
      )
      const uploaded = await taroPrivatePictureLibraryCloudPort.upload(
        encrypted
      )
      if (uploaded.value) setCloudMetadata(uploaded.value)
      setProgress(null)
      clearPrivateLibraryPassphrase()
      finish(uploaded)
    } catch (error) {
      setProgress(null)
      clearPrivateLibraryPassphrase()
      finish({
        ok: false,
        message: describePrivateArchiveEncryptionError(error)
      })
    }
  }

  const downloadPrivateLibrary = async () => {
    if (busy) return
    if (!privateLibraryPassphraseValidation.ok) {
      finish({
        ok: false,
        message: privateLibraryPassphraseValidation.message
      })
      return
    }
    const session = taroCboardSessionStore.load()
    setAccountSession(session)
    if (!session) {
      finish({
        ok: false,
        message: '请先在照护者设置中登录 CBoard 账号。'
      })
      return
    }

    setBusy('cloud-download')
    setNotice('')
    setProgress(null)
    const metadataResult =
      await taroPrivatePictureLibraryCloudPort.getMetadata()
    if (!metadataResult.ok || !metadataResult.value) {
      finish(metadataResult)
      return
    }
    setCloudMetadata(metadataResult.value)
    const downloadConfirmation = await Taro.showModal({
      title: '下载云端私人图片',
      content:
        `最近更新：${formatCloudDate(metadataResult.value.updatedAt)}；` +
        `大小：${formatCloudSize(metadataResult.value.size)}。` +
        '下载后只在本机解密并检查内容，不会立即改动本机图库。',
      confirmText: '下载并检查',
      cancelText: '取消'
    })
    if (!downloadConfirmation.confirm) {
      setBusy(null)
      return
    }

    const downloaded = await taroPrivatePictureLibraryCloudPort.download()
    if (!downloaded.ok || !downloaded.value) {
      finish(downloaded)
      return
    }
    if (downloaded.value.data.byteLength !== metadataResult.value.size) {
      finish({
        ok: false,
        message: '下载大小与云端记录不一致，未恢复本机图库。'
      })
      return
    }
    let plaintextArchive: Uint8Array
    try {
      plaintextArchive = await decryptPrivateArchiveData(
        downloaded.value.data,
        privateLibraryPassphraseValidation.passphrase
      )
      clearPrivateLibraryPassphrase()
    } catch (error) {
      clearPrivateLibraryPassphrase()
      finish({
        ok: false,
        message: describePrivateArchiveEncryptionError(error)
      })
      return
    }
    const inspected = await backupService.inspectArchiveData(
      plaintextArchive
    )
    if (!inspected.ok || !inspected.summary) {
      finish(inspected)
      return
    }

    const restoreConfirmation = await Taro.showModal({
      title: '确认恢复私人图片',
      content:
        `已检查到 ${inspected.summary.customPictureCount} 张个人图片。` +
        (conflictStrategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
          ? '相同 ID 将以云端备份为准，其他本机内容保留。'
          : '相同 ID 保留本机内容，只补充本机缺少的图片。'),
      confirmText: '确认恢复',
      cancelText: '暂不恢复'
    })
    if (!restoreConfirmation.confirm) {
      finish({
        ok: true,
        message: '云端备份已下载并检查，未改动本机图库。'
      })
      return
    }

    finish(
      await backupService.restoreArchiveData(
        plaintextArchive,
        conflictStrategy,
        setProgress
      )
    )
  }

  const deletePrivateLibrary = async () => {
    if (busy) return
    const session = taroCboardSessionStore.load()
    setAccountSession(session)
    if (!session) {
      finish({
        ok: false,
        message: '请先在照护者设置中登录 CBoard 账号。'
      })
      return
    }
    const confirmation = await Taro.showModal({
      title: '删除云端私人图片备份',
      content:
        '只删除当前账号中的私人图片密文备份；当前设备上的图片和本机 ZIP 都会保留。',
      confirmText: '删除云端备份',
      confirmColor: '#9d332d',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('cloud-delete')
    setNotice('')
    setProgress(null)
    const result = await taroPrivatePictureLibraryCloudPort.delete()
    if (result.ok && result.value && result.value.deleted) {
      setCloudMetadata(null)
    }
    finish(result)
  }

  const uploadPrivateDeviceData = async () => {
    if (busy) return
    if (!completePassphraseValidation.ok) {
      finish({
        ok: false,
        message: completePassphraseValidation.message
      })
      return
    }
    const session = taroCboardSessionStore.load()
    setAccountSession(session)
    if (!session) {
      finish({
        ok: false,
        message: '请先在照护者设置中登录 CBoard 账号。'
      })
      return
    }
    const confirmation = await Taro.showModal({
      title: '备份完整私有数据到账号',
      content:
        '完整数据会先在本机使用恢复密码加密，再上传密文；服务端无法读取密码和备份内容。忘记密码后无法恢复。不会上传整套默认 CBoard 沟通板。',
      confirmText: '生成并上传',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('device-cloud-upload')
    setNotice('')
    setProgress(null)
    const built = await backupService.buildPrivateDeviceDataArchive(
      setProgress
    )
    if (!built.ok || !built.archive) {
      finish(built)
      return
    }

    try {
      const encrypted = await encryptPrivateArchiveData(
        built.archive.data,
        completePassphraseValidation.passphrase
      )
      const uploaded = await taroPrivateDeviceDataCloudPort.upload(encrypted)
      if (uploaded.value) setDeviceCloudMetadata(uploaded.value)
      setProgress(null)
      clearPrivateDeviceDataPassphrase()
      finish(uploaded)
    } catch (error) {
      setProgress(null)
      clearPrivateDeviceDataPassphrase()
      finish({
        ok: false,
        message: describePrivateArchiveEncryptionError(error)
      })
    }
  }

  const downloadPrivateDeviceData = async () => {
    if (busy) return
    if (!passphraseValidation.ok) {
      finish({ ok: false, message: passphraseValidation.message })
      return
    }
    const session = taroCboardSessionStore.load()
    setAccountSession(session)
    if (!session) {
      finish({
        ok: false,
        message: '请先在照护者设置中登录 CBoard 账号。'
      })
      return
    }

    setBusy('device-cloud-download')
    setNotice('')
    setProgress(null)
    const metadataResult =
      await taroPrivateDeviceDataCloudPort.getMetadata()
    if (!metadataResult.ok || !metadataResult.value) {
      finish(metadataResult)
      return
    }
    setDeviceCloudMetadata(metadataResult.value)
    const downloadConfirmation = await Taro.showModal({
      title: '下载完整私有数据',
      content:
        `最近更新：${formatCloudDate(metadataResult.value.updatedAt)}；` +
        `大小：${formatCloudSize(metadataResult.value.size)}。` +
        '下载后只在本机解密，再检查内容并显示摘要，不会立即改动本机数据。',
      confirmText: '下载并检查',
      cancelText: '取消'
    })
    if (!downloadConfirmation.confirm) {
      setBusy(null)
      return
    }

    const downloaded = await taroPrivateDeviceDataCloudPort.download()
    if (!downloaded.ok || !downloaded.value) {
      finish(downloaded)
      return
    }
    if (downloaded.value.data.byteLength !== metadataResult.value.size) {
      finish({
        ok: false,
        message: '下载大小与云端记录不一致，未恢复本机数据。'
      })
      return
    }
    let plaintextArchive: Uint8Array
    try {
      plaintextArchive = await decryptPrivateArchiveData(
        downloaded.value.data,
        passphraseValidation.passphrase
      )
      clearPrivateDeviceDataPassphrase()
    } catch (error) {
      clearPrivateDeviceDataPassphrase()
      finish({
        ok: false,
        message: describePrivateArchiveEncryptionError(error)
      })
      return
    }
    const inspected = await backupService.inspectArchiveData(plaintextArchive)
    if (!inspected.ok || !inspected.summary) {
      finish(inspected)
      return
    }
    const stats = inspected.summary.deviceDataStats
    if (!stats) {
      finish({
        ok: false,
        message: '解密后的备份不包含完整私有数据，未恢复本机数据。'
      })
      return
    }

    const restoreConfirmation = await Taro.showModal({
      title: '确认恢复完整私有数据',
      content:
        `已检查到 ${inspected.summary.customPictureCount} 张个人图片、` +
        `${stats.savedPhraseCount} 条常用语、` +
        `${stats.expressionCount} 条沟通与接收记录、` +
        `${stats.correctionCount} 条修正和 ${stats.draftCount} 条待同步反馈。` +
        (conflictStrategy === PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
          ? '相同 ID 将以云端备份为准，其他本机内容保留。'
          : '相同 ID 保留本机内容，只补充本机缺少的数据。'),
      confirmText: '确认恢复',
      cancelText: '暂不恢复'
    })
    if (!restoreConfirmation.confirm) {
      finish({
        ok: true,
        message: '云端完整私有数据已下载并检查，未改动本机数据。'
      })
      return
    }

    finish(
      await backupService.restoreArchiveData(
        plaintextArchive,
        conflictStrategy,
        setProgress
      )
    )
  }

  const deletePrivateDeviceData = async () => {
    if (busy) return
    const session = taroCboardSessionStore.load()
    setAccountSession(session)
    if (!session) {
      finish({
        ok: false,
        message: '请先在照护者设置中登录 CBoard 账号。'
      })
      return
    }
    const confirmation = await Taro.showModal({
      title: '删除云端完整私有数据',
      content:
        '只删除当前账号中的完整私有数据密文；当前设备数据、私人图片云备份和本机 ZIP 都会保留。',
      confirmText: '删除云端备份',
      confirmColor: '#9d332d',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('device-cloud-delete')
    setNotice('')
    setProgress(null)
    const result = await taroPrivateDeviceDataCloudPort.delete()
    if (result.ok && result.value && result.value.deleted) {
      setDeviceCloudMetadata(null)
    }
    finish(result)
  }

  const clearPrivatePictograms = async () => {
    if (busy) return
    const confirmation = await Taro.showModal({
      title: '只清除私人图片',
      content:
        '个人换图和本机补图文件会从当前设备删除；公开图库、沟通历史和云端数据都会保留。此操作不能撤销，建议先导出完整本机备份。',
      confirmText: '确认清除',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('private-clear')
    setNotice('')
    setProgress(null)
    finish(await backupService.clearPrivatePictograms())
  }

  const clearAllLocalData = async () => {
    if (busy) return
    const confirmation = await Taro.showModal({
      title: '清除全部本机数据',
      content:
        '将清除当前小程序内的图片、备份文件、沟通记录、设置和登录信息，但不会删除云端账号数据。此操作不能撤销，建议先导出完整本机备份。',
      confirmText: '全部清除',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy('all-clear')
    setNotice('')
    setProgress(null)
    const result = await backupService.clearAllLocalData()
    finish(result)
    if (result.ok) {
      void Taro.reLaunch({ url: '/pages/index/index' })
    }
  }

  const returnToCommunication = () => {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' })
    )
  }

  return (
    <View className='library-backup-page'>
      <View className='library-backup-hero'>
        <Text className='library-backup-hero__eyebrow'>
          图语家 · 本机数据工具
        </Text>
        <Text className='library-backup-hero__title'>
          把熟悉的图片带到新设备
        </Text>
        <Text className='library-backup-hero__description'>
          ZIP 同时保存图片文件和标签、同义词、分类、使用次数。备份由你主动转发，不会自动上传语音或图片。
        </Text>
      </View>

      <View className='library-backup-card'>
        <Text className='library-backup-card__index'>01</Text>
        <Text className='library-backup-card__title'>选择备份范围</Text>
        <View className='library-backup-options'>
          <Button
            id='picture-library-scope-custom'
            className={
              scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.custom
                ? 'library-backup-option library-backup-option--active'
                : 'library-backup-option'
            }
            disabled={Boolean(busy)}
            onClick={() =>
              setScope(PICTURE_LIBRARY_ARCHIVE_SCOPES.custom)
            }
          >
            <Text className='library-backup-option__title'>
              只备份个人图片
            </Text>
            <Text className='library-backup-option__hint'>
              个人替换图、已确认补图及对应使用次数
            </Text>
          </Button>
          <Button
            id='picture-library-scope-full'
            className={
              scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full
                ? 'library-backup-option library-backup-option--active'
                : 'library-backup-option'
            }
            disabled={Boolean(busy)}
            onClick={() =>
              setScope(PICTURE_LIBRARY_ARCHIVE_SCOPES.full)
            }
          >
            <Text className='library-backup-option__title'>
              完整图库
            </Text>
            <Text className='library-backup-option__hint'>
              包含全部沟通板、图卡顺序和个人图片
            </Text>
          </Button>
        </View>
        <Button
          id='picture-library-export-button'
          className='library-backup-primary'
          disabled={Boolean(busy)}
          onClick={exportArchive}
        >
          {busy === 'export' ? '正在生成 ZIP...' : '生成并分享 ZIP'}
        </Button>
      </View>

      <View className='library-backup-card'>
        <Text className='library-backup-card__index'>02</Text>
        <Text className='library-backup-card__title'>恢复到当前设备</Text>
        <Text className='library-backup-card__hint'>
          先选择相同 ID 的处理方式，再从微信聊天或文件中选择图库 ZIP 或完整本机数据 ZIP；系统会校验类型并恢复对应内容。
        </Text>
        <View className='library-backup-options'>
          <Button
            id='picture-library-conflict-merge'
            className={
              conflictStrategy ===
              PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
                ? 'library-backup-option library-backup-option--active'
                : 'library-backup-option'
            }
            disabled={Boolean(busy)}
            onClick={() =>
              setConflictStrategy(
                PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
              )
            }
          >
            <Text className='library-backup-option__title'>
              备份优先
            </Text>
            <Text className='library-backup-option__hint'>
              相同 ID 用备份替换，其他本机内容保留
            </Text>
          </Button>
          <Button
            id='picture-library-conflict-skip'
            className={
              conflictStrategy ===
              PICTURE_LIBRARY_CONFLICT_STRATEGIES.skip
                ? 'library-backup-option library-backup-option--active'
                : 'library-backup-option'
            }
            disabled={Boolean(busy)}
            onClick={() =>
              setConflictStrategy(
                PICTURE_LIBRARY_CONFLICT_STRATEGIES.skip
              )
            }
          >
            <Text className='library-backup-option__title'>
              本机优先
            </Text>
            <Text className='library-backup-option__hint'>
              相同 ID 跳过，只补充缺少的内容
            </Text>
          </Button>
        </View>
        <Button
          id='picture-library-import-button'
          className='library-backup-secondary'
          disabled={Boolean(busy)}
          onClick={importArchive}
        >
          {busy === 'import' ? '正在恢复...' : '选择 ZIP 并恢复'}
        </Button>
        <View className='library-backup-standard'>
          <Text className='library-backup-card__title'>导入开放标准板</Text>
          <Text className='library-backup-card__hint'>
            复用 CBoard 的 Open Board Format 语义，并复用 AACTools 转换器支持 AsTeRICS、Gridset、Snap 和 TouchChat；Snap/TouchChat 需登录，源文件只做瞬时转换。不会覆盖内置首页，也不会把导入图片公开上传。
          </Text>
          <Button
            id='open-aac-import-page-button'
            className='library-backup-secondary'
            disabled={Boolean(busy)}
            onClick={openAacImportPage}
          >
            打开 AAC 沟通板导入
          </Button>
        </View>
      </View>

      <View className='library-backup-card library-backup-card--reset'>
        <Text className='library-backup-card__index'>03</Text>
        <Text className='library-backup-card__title'>
          恢复内置图库
        </Text>
        <Text className='library-backup-card__hint'>
          只恢复应用自带的 CBoard 沟通板，不删除个人图片、补图、沟通历史或账号设置。
        </Text>
        <Button
          id='picture-library-reset-button'
          className='library-backup-reset'
          disabled={Boolean(busy)}
          onClick={resetLibrary}
        >
          {busy === 'reset' ? '正在恢复...' : '恢复默认 CBoard 图库'}
        </Button>
      </View>

      <View className='library-backup-card library-backup-card--privacy'>
        <Text className='library-backup-card__index'>04</Text>
        <Text className='library-backup-card__title'>
          设备交接与隐私
        </Text>
        <Text className='library-backup-card__hint'>
          完整备份包含图库、来源与许可、常用语、沟通历史、接收记录、修正记录和待同步反馈。需要恢复时使用上方“选择 ZIP 并恢复”；清除操作只影响当前设备，不会删除云端账号。
        </Text>
        <Button
          id='local-device-data-export-button'
          className='library-backup-primary'
          disabled={Boolean(busy)}
          onClick={exportDeviceData}
        >
          {busy === 'device-export'
            ? '正在生成完整备份...'
            : '导出完整本机数据 ZIP'}
        </Button>
        <View className='library-backup-privacy-actions'>
          <Button
            id='private-pictograms-clear-button'
            className='library-backup-secondary'
            disabled={Boolean(busy)}
            onClick={clearPrivatePictograms}
          >
            {busy === 'private-clear'
              ? '正在清除私人图片...'
              : '只清除私人图片'}
          </Button>
          <Button
            id='all-local-data-clear-button'
            className='library-backup-danger'
            disabled={Boolean(busy)}
            onClick={clearAllLocalData}
          >
            {busy === 'all-clear'
              ? '正在清除全部数据...'
              : '清除全部本机数据'}
          </Button>
        </View>
      </View>

      <View className='library-backup-card library-backup-card--cloud'>
        <Text className='library-backup-card__index'>05</Text>
        <Text className='library-backup-card__title'>
          跨设备私人图片备份
        </Text>
        <Text className='library-backup-card__hint'>
          复用 CBoard 账号和 cboard-api 私有存储。只有主动点击才会上传；个人图片 ZIP 会先在本机端到端加密，服务端只保存密文，不生成公开图片地址。恢复密码不会上传或保存，遗忘后无法找回。
        </Text>
        <Text className='library-backup-cloud-status'>
          {accountSession
            ? `已登录：${accountSession.user.email || accountSession.user.name || 'CBoard 账号'}`
            : '尚未登录：请先到照护者设置登录 CBoard 账号'}
        </Text>
        {cloudMetadata && (
          <Text className='library-backup-cloud-status'>
            云端备份：{formatCloudDate(cloudMetadata.updatedAt)}，
            {formatCloudSize(cloudMetadata.size)}
          </Text>
        )}
        <View className='library-backup-passphrase'>
          <Text className='library-backup-passphrase__label'>
            私人图片恢复密码
          </Text>
          <Input
            id='private-picture-library-passphrase-input'
            className='library-backup-passphrase__input'
            password
            maxlength={256}
            value={privateLibraryPassphrase}
            placeholder='至少 12 个字符'
            onInput={event =>
              setPrivateLibraryPassphrase(event.detail.value)
            }
          />
          <Text className='library-backup-passphrase__label'>
            再次输入（上传时核对）
          </Text>
          <Input
            id='private-picture-library-passphrase-confirmation-input'
            className='library-backup-passphrase__input'
            password
            maxlength={256}
            value={privateLibraryPassphraseConfirmation}
            placeholder='再次输入相同密码'
            onInput={event =>
              setPrivateLibraryPassphraseConfirmation(event.detail.value)
            }
          />
          <Text
            className={
              privateLibraryPassphrase &&
              !completePrivateLibraryPassphraseValidation.ok
                ? 'library-backup-passphrase__hint library-backup-passphrase__hint--error'
                : 'library-backup-passphrase__hint'
            }
          >
            {privateLibraryPassphrase &&
            !completePrivateLibraryPassphraseValidation.ok
              ? completePrivateLibraryPassphraseValidation.message
              : '密码仅在本页内存中使用；上传或解密结束后立即清空。'}
          </Text>
        </View>
        <View className='library-backup-cloud-actions'>
          <Button
            id='private-library-cloud-upload-button'
            className='library-backup-primary'
            disabled={
              Boolean(busy) ||
              !accountSession ||
              !completePrivateLibraryPassphraseValidation.ok
            }
            onClick={uploadPrivateLibrary}
          >
            {busy === 'cloud-upload'
              ? '正在上传私人图片...'
              : '备份私人图片到账号'}
          </Button>
          <Button
            id='private-library-cloud-download-button'
            className='library-backup-secondary'
            disabled={
              Boolean(busy) ||
              !accountSession ||
              !privateLibraryPassphraseValidation.ok
            }
            onClick={downloadPrivateLibrary}
          >
            {busy === 'cloud-download'
              ? '正在下载并检查...'
              : '下载、复核并恢复'}
          </Button>
          <Button
            id='private-library-cloud-delete-button'
            className='library-backup-reset'
            disabled={Boolean(busy) || !accountSession}
            onClick={deletePrivateLibrary}
          >
            {busy === 'cloud-delete'
              ? '正在删除云端备份...'
              : '只删除云端备份'}
          </Button>
        </View>
      </View>

      <View className='library-backup-card library-backup-card--cloud'>
        <Text className='library-backup-card__index'>06</Text>
        <Text className='library-backup-card__title'>
          跨设备完整私有数据备份
        </Text>
        <Text className='library-backup-card__hint'>
          复用 CBoard 账号和同一套 ZIP 恢复核心，但上传前先在本机端到端加密。服务端只保存密文，恢复密码不会上传或保存，遗忘后无法找回。下载后必须先解密、检查摘要并再次确认。
        </Text>
        <Text className='library-backup-cloud-status'>
          {accountSession
            ? `已登录：${accountSession.user.email || accountSession.user.name || 'CBoard 账号'}`
            : '尚未登录：请先到照护者设置登录 CBoard 账号'}
        </Text>
        {deviceCloudMetadata && (
          <Text className='library-backup-cloud-status'>
            完整数据备份：
            {formatCloudDate(deviceCloudMetadata.updatedAt)}，
            {formatCloudSize(deviceCloudMetadata.size)}
          </Text>
        )}
        <View className='library-backup-passphrase'>
          <Text className='library-backup-passphrase__label'>
            完整数据恢复密码
          </Text>
          <Input
            id='private-device-data-passphrase-input'
            className='library-backup-passphrase__input'
            password
            maxlength={256}
            value={privateDeviceDataPassphrase}
            placeholder='至少 12 个字符'
            onInput={event =>
              setPrivateDeviceDataPassphrase(event.detail.value)
            }
          />
          <Text className='library-backup-passphrase__label'>
            再次输入（上传时核对）
          </Text>
          <Input
            id='private-device-data-passphrase-confirmation-input'
            className='library-backup-passphrase__input'
            password
            maxlength={256}
            value={privateDeviceDataPassphraseConfirmation}
            placeholder='再次输入相同密码'
            onInput={event =>
              setPrivateDeviceDataPassphraseConfirmation(event.detail.value)
            }
          />
          <Text
            className={
              privateDeviceDataPassphrase &&
              !completePassphraseValidation.ok
                ? 'library-backup-passphrase__hint library-backup-passphrase__hint--error'
                : 'library-backup-passphrase__hint'
            }
          >
            {privateDeviceDataPassphrase && !completePassphraseValidation.ok
              ? completePassphraseValidation.message
              : '密码仅在本页内存中使用；上传或解密结束后立即清空。'}
          </Text>
        </View>
        <View className='library-backup-cloud-actions'>
          <Button
            id='private-device-data-cloud-upload-button'
            className='library-backup-primary'
            disabled={
              Boolean(busy) ||
              !accountSession ||
              !completePassphraseValidation.ok
            }
            onClick={uploadPrivateDeviceData}
          >
            {busy === 'device-cloud-upload'
              ? '正在上传完整数据...'
              : '备份完整私有数据到账号'}
          </Button>
          <Button
            id='private-device-data-cloud-download-button'
            className='library-backup-secondary'
            disabled={
              Boolean(busy) ||
              !accountSession ||
              !passphraseValidation.ok
            }
            onClick={downloadPrivateDeviceData}
          >
            {busy === 'device-cloud-download'
              ? '正在下载并检查...'
              : '下载、复核并恢复'}
          </Button>
          <Button
            id='private-device-data-cloud-delete-button'
            className='library-backup-reset'
            disabled={Boolean(busy) || !accountSession}
            onClick={deletePrivateDeviceData}
          >
            {busy === 'device-cloud-delete'
              ? '正在删除完整数据...'
              : '只删除完整数据云备份'}
          </Button>
        </View>
      </View>

      {progress && (
        <View className='library-backup-progress'>
          <View className='library-backup-progress__track'>
            <View
              className='library-backup-progress__value'
              style={{ width: `${progress.percent}%` }}
            />
          </View>
          <Text className='library-backup-progress__text'>
            {progress.detail || `已完成 ${progress.percent}%`}
          </Text>
        </View>
      )}

      {notice && (
        <Text
          id='picture-library-backup-notice'
          className={
            noticeOk
              ? 'library-backup-notice library-backup-notice--ok'
              : 'library-backup-notice library-backup-notice--error'
          }
        >
          {notice}
        </Text>
      )}

      <Button
        className='library-backup-back'
        disabled={Boolean(busy)}
        onClick={returnToCommunication}
      >
        返回沟通
      </Button>
    </View>
  )
}
