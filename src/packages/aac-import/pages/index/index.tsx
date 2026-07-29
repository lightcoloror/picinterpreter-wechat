import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  PICTURE_LIBRARY_CONFLICT_STRATEGIES,
  type PictureLibraryConflictStrategy,
  type PictureLibraryProgress
} from '@cboard-communication-core/pictureLibraryArchive'

import { taroCommunicationAacImportPort } from '../../../../platform/taroCommunicationAacImportPort'
import { taroPictureLibraryArchivePort } from '../../../../platform/taroPictureLibraryArchivePort'
import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import { createOpenBoardImportService } from '../../openBoardImportService'
import './index.css'

const importService = createOpenBoardImportService({
  boardStore: taroPictureLibraryStore,
  archivePort: taroPictureLibraryArchivePort,
  aacImportPort: taroCommunicationAacImportPort
})

export default function AacImportPage() {
  const [conflictStrategy, setConflictStrategy] =
    useState<PictureLibraryConflictStrategy>(
      PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
    )
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] =
    useState<PictureLibraryProgress | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeOk, setNoticeOk] = useState(false)

  const importOpenBoard = async () => {
    if (busy) return
    const confirmation = await Taro.showModal({
      title: '导入标准板或 AAC 文件',
      content:
        '支持 Open Board .obf/.obz、AsTeRICS .grd、未加密 Gridset .gridset、Snap .sps/.spb 与 TouchChat .ce。Snap/TouchChat 需先登录并由 cboard-api 瞬时转换；源文件不会保存。沟通板会作为本机个人板导入，图片不会公开上传。',
      confirmText: '选择文件',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setBusy(true)
    setNotice('')
    setProgress(null)
    const result = await importService.importOpenBoard(
      conflictStrategy,
      setProgress
    )
    setNotice(result.message)
    setNoticeOk(result.ok)
    setBusy(false)
  }

  const returnToBackup = () => {
    if (busy) return
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' })
    )
  }

  return (
    <View className='aac-import-page'>
      <View className='aac-import-hero'>
        <Text className='aac-import-hero__eyebrow'>
          图语家 · 家属图库维护
        </Text>
        <Text className='aac-import-hero__title'>导入 AAC 沟通板</Text>
        <Text className='aac-import-hero__description'>
          复用 CBoard、Open Board Format 与 AACTools 的成熟转换器。选择文件后先校验和复核，成功前不会替换本机图库。
        </Text>
      </View>

      <View className='aac-import-card'>
        <Text className='aac-import-card__index'>01</Text>
        <Text className='aac-import-card__title'>选择同 ID 处理方式</Text>
        <View className='aac-import-options'>
          <Button
            id='picture-library-conflict-merge'
            className={
              conflictStrategy ===
              PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
                ? 'aac-import-option aac-import-option--active'
                : 'aac-import-option'
            }
            disabled={busy}
            onClick={() =>
              setConflictStrategy(
                PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
              )
            }
          >
            <Text className='aac-import-option__title'>导入文件优先</Text>
            <Text className='aac-import-option__hint'>
              相同 ID 用导入内容替换，其他本机板保留
            </Text>
          </Button>
          <Button
            id='picture-library-conflict-skip'
            className={
              conflictStrategy ===
              PICTURE_LIBRARY_CONFLICT_STRATEGIES.skip
                ? 'aac-import-option aac-import-option--active'
                : 'aac-import-option'
            }
            disabled={busy}
            onClick={() =>
              setConflictStrategy(
                PICTURE_LIBRARY_CONFLICT_STRATEGIES.skip
              )
            }
          >
            <Text className='aac-import-option__title'>本机内容优先</Text>
            <Text className='aac-import-option__hint'>
              相同 ID 跳过，只加入本机缺少的板
            </Text>
          </Button>
        </View>
      </View>

      <View className='aac-import-card'>
        <Text className='aac-import-card__index'>02</Text>
        <Text className='aac-import-card__title'>选择 AAC 文件</Text>
        <Text className='aac-import-card__hint'>
          支持 OBF、OBZ、GRD、Gridset、Snap 和 TouchChat。加密文件、供应商专有动作及不支持的媒体会明确提示，不会静默覆盖。
        </Text>
        <Button
          id='open-board-import-button'
          className='aac-import-primary'
          disabled={busy}
          onClick={importOpenBoard}
        >
          {busy ? '正在导入沟通板...' : '选择文件并导入'}
        </Button>
      </View>

      {progress && (
        <View className='aac-import-progress'>
          <View className='aac-import-progress__track'>
            <View
              className='aac-import-progress__value'
              style={{ width: `${progress.percent}%` }}
            />
          </View>
          <Text className='aac-import-progress__text'>
            {progress.detail || `已完成 ${progress.percent}%`}
          </Text>
        </View>
      )}

      {notice && (
        <Text
          id='open-board-import-notice'
          className={
            noticeOk
              ? 'aac-import-notice aac-import-notice--ok'
              : 'aac-import-notice aac-import-notice--error'
          }
        >
          {notice}
        </Text>
      )}

      <Button
        id='aac-import-back-button'
        className='aac-import-back'
        disabled={busy}
        onClick={returnToBackup}
      >
        返回图库备份
      </Button>
    </View>
  )
}
