import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Picker,
  Switch,
  Text,
  View
} from '@tarojs/components'
import Taro from '@tarojs/taro'
import { isPersonalCommunicationBoard } from '@cboard-communication-core/boardManagement'
import {
  PUBLIC_BOARD_PUBLICATION_LICENSE
} from '@cboard-communication-core/publicBoardPublication'
import type { BoardDTO } from '@cboard-communication-core/dto'

import { taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import type { OwnedCboardBoard } from '../../platform/publicBoardPublicationPort'
import { taroPublicBoardPublicationPort } from '../../platform/taroPublicBoardPublicationPort'
import { createPublicBoardManagementService } from './publicBoardManagementService'
import { createPublicBoardPublicationService } from './publicBoardPublicationService'

const service = createPublicBoardPublicationService({
  port: taroPublicBoardPublicationPort
})
const managementService = createPublicBoardManagementService({
  port: taroPublicBoardPublicationPort
})

const PHASE_LABELS = {
  preflight: '正在检查板块、许可和媒体',
  creating: '正在建立私有草稿',
  uploading: '正在上传公开素材',
  publishing: '正在公开沟通板',
  rollback: '正在撤回未完成的发布'
}

export default function PublicBoardPublisher({
  boards
}: {
  boards: BoardDTO[]
}) {
  const personalBoards = boards.filter(isPersonalCommunicationBoard)
  const session = taroCboardSessionStore.load()
  const defaultAuthor =
    String((session && session.user.name) || '').trim() ||
    String((session && session.user.email) || '').trim()
  const [selectedBoardId, setSelectedBoardId] = useState(
    personalBoards[0]?.id || ''
  )
  const [author, setAuthor] = useState(defaultAuthor)
  const [description, setDescription] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [status, setStatus] = useState(
    '只有登录家属主动确认后才会上传；患者页面不会自动发布。'
  )
  const [publishedUrl, setPublishedUrl] = useState('')
  const [ownedPublicBoards, setOwnedPublicBoards] = useState<
    OwnedCboardBoard[]
  >([])
  const [managementLoading, setManagementLoading] = useState(false)
  const [managingBoardId, setManagingBoardId] = useState('')
  const [managementStatus, setManagementStatus] = useState(
    '登录后可查看并管理这个账号发布的全部 CBoard 公共板。'
  )

  const effectiveBoardId = personalBoards.some(
    board => board.id === selectedBoardId
  )
    ? selectedBoardId
    : personalBoards[0]?.id || ''
  const selectedIndex = Math.max(
    0,
    personalBoards.findIndex(board => board.id === effectiveBoardId)
  )
  const canPublish =
    Boolean(effectiveBoardId) &&
    Boolean(author.trim()) &&
    rightsConfirmed &&
    privacyConfirmed &&
    !publishing

  const refreshOwnedPublicBoards = async (quiet = false) => {
    setManagementLoading(true)
    try {
      const publicBoards =
        await managementService.listOwnedPublicBoards()
      setOwnedPublicBoards(publicBoards)
      if (!quiet) {
        setManagementStatus(
          publicBoards.length
            ? `当前有 ${publicBoards.length} 块公开沟通板。`
            : '这个账号目前没有公开沟通板。'
        )
      }
    } catch (error) {
      setOwnedPublicBoards([])
      if (!quiet) {
        setManagementStatus(
          error instanceof Error
            ? error.message
            : '读取我的公共板失败。'
        )
      }
    } finally {
      setManagementLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    if (!taroPublicBoardPublicationPort.getIdentity()) return undefined

    setManagementLoading(true)
    void managementService
      .listOwnedPublicBoards()
      .then(publicBoards => {
        if (!active) return
        setOwnedPublicBoards(publicBoards)
        setManagementStatus(
          publicBoards.length
            ? `当前有 ${publicBoards.length} 块公开沟通板。`
            : '这个账号目前没有公开沟通板。'
        )
      })
      .catch(error => {
        if (!active) return
        setManagementStatus(
          error instanceof Error
            ? error.message
            : '读取我的公共板失败。'
        )
      })
      .finally(() => {
        if (active) setManagementLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const publish = async () => {
    if (!canPublish) return
    const confirmation = await Taro.showModal({
      title: '确认公开发布',
      content:
        '所选板及其个人子板、图片、录音和短视频将公开给所有 CBoard 用户。' +
        '公开副本可能已被他人下载，即使以后下架也无法收回这些副本。是否继续？',
      confirmText: '确认公开',
      cancelText: '暂不发布'
    })
    if (!confirmation.confirm) {
      setStatus('已取消，没有上传或公开任何内容。')
      return
    }

    setPublishing(true)
    setPublishedUrl('')
    const result = await service.publish(
      boards,
      effectiveBoardId,
      {
        author: author.trim(),
        description: description.trim(),
        licenseId: PUBLIC_BOARD_PUBLICATION_LICENSE.id,
        rightsConfirmed,
        privacyConfirmed
      },
      progress => {
        const label = PHASE_LABELS[progress.phase]
        setStatus(`${label}（${progress.completed}/${progress.total}）`)
      }
    )
    setPublishing(false)
    setStatus(result.message)
    setPublishedUrl(result.ok ? result.url || '' : '')
    if (result.ok) void refreshOwnedPublicBoards(true)
  }

  const unpublishOwnedBoard = async (board: OwnedCboardBoard) => {
    const confirmation = await Taro.showModal({
      title: '确认取消公开',
      content:
        `“${board.name}”将从 CBoard 公共板列表中移除并变为私有。` +
        '他人已经下载的副本不会被远程删除。',
      confirmText: '取消公开',
      cancelText: '保持公开'
    })
    if (!confirmation.confirm) return

    setManagingBoardId(board.id)
    try {
      await managementService.unpublishBoard(board)
      setManagementStatus(`已取消公开“${board.name}”。`)
      await refreshOwnedPublicBoards(true)
    } catch (error) {
      setManagementStatus(
        error instanceof Error ? error.message : '取消公开失败。'
      )
    } finally {
      setManagingBoardId('')
    }
  }

  const deleteOwnedBoard = async (board: OwnedCboardBoard) => {
    const confirmation = await Taro.showModal({
      title: '确认永久删除云端板',
      content:
        `“${board.name}”将从这个 CBoard 账号永久删除。` +
        '其他板若链接到它会出现断链，本机个人板和他人已下载副本不会被删除。',
      confirmText: '永久删除',
      confirmColor: '#b42318',
      cancelText: '保留'
    })
    if (!confirmation.confirm) return

    setManagingBoardId(board.id)
    try {
      await managementService.deleteBoard(board.id)
      setManagementStatus(`已删除云端板“${board.name}”。`)
      await refreshOwnedPublicBoards(true)
    } catch (error) {
      setManagementStatus(
        error instanceof Error ? error.message : '删除云端板失败。'
      )
    } finally {
      setManagingBoardId('')
    }
  }

  if (!personalBoards.length) {
    return (
      <View className='public-publisher'>
        <Text className='public-publisher__title'>发布公共沟通板</Text>
        <Text className='public-publisher__hint'>
          请先在下方新建个人板块，再决定是否公开贡献。
        </Text>
      </View>
    )
  }

  return (
    <View className='public-publisher'>
      <Text className='public-publisher__title'>发布公共沟通板</Text>
      <Text className='public-publisher__hint'>
        复用 CBoard 原生公共板；发布入口仅供家属使用，不会进入患者表达页。
      </Text>

      <Picker
        mode='selector'
        range={personalBoards.map(board => board.name)}
        value={selectedIndex}
        disabled={publishing}
        onChange={event => {
          const index = Number(event.detail.value)
          setSelectedBoardId(personalBoards[index]?.id || '')
          setPublishedUrl('')
        }}
      >
        <View
          id='public-board-publication-board-picker'
          className='public-publisher__picker'
        >
          发布板块：{personalBoards[selectedIndex]?.name || '请选择'}
        </View>
      </Picker>

      <Input
        id='public-board-publication-author'
        className='public-publisher__input'
        value={author}
        maxlength={100}
        disabled={publishing}
        placeholder='公开署名（必填）'
        onInput={event => setAuthor(event.detail.value)}
      />
      <Input
        id='public-board-publication-description'
        className='public-publisher__input'
        value={description}
        maxlength={500}
        disabled={publishing}
        placeholder='板块用途说明（可选）'
        onInput={event => setDescription(event.detail.value)}
      />

      <View className='public-publisher__consent'>
        <View className='public-publisher__consent-copy'>
          <Text className='public-publisher__consent-title'>
            我拥有或已获得全部素材的公开授权
          </Text>
          <Text className='public-publisher__consent-hint'>
            自有素材将按 {PUBLIC_BOARD_PUBLICATION_LICENSE.name} 署名公开；
            ARASAAC 等已有公开素材继续保留原许可。
          </Text>
        </View>
        <Switch
          id='public-board-publication-rights-switch'
          checked={rightsConfirmed}
          disabled={publishing}
          color='#287560'
          onChange={event => setRightsConfirmed(event.detail.value)}
        />
      </View>

      <View className='public-publisher__consent'>
        <View className='public-publisher__consent-copy'>
          <Text className='public-publisher__consent-title'>
            我已移除患者隐私和不宜公开的家庭照片
          </Text>
          <Text className='public-publisher__consent-hint'>
            图片、录音和短视频会成为公开素材；他人下载的副本无法远程收回。
          </Text>
        </View>
        <Switch
          id='public-board-publication-privacy-switch'
          checked={privacyConfirmed}
          disabled={publishing}
          color='#287560'
          onChange={event => setPrivacyConfirmed(event.detail.value)}
        />
      </View>

      <Button
        id='public-board-publication-submit'
        className='public-publisher__button'
        disabled={!canPublish}
        onClick={() => void publish()}
      >
        {publishing ? '发布处理中' : '发布为 CBoard 公共板'}
      </Button>
      <Text className='public-publisher__status'>{status}</Text>
      {publishedUrl && (
        <Button
          id='public-board-publication-copy-link'
          className='public-publisher__copy'
          onClick={() => {
            void Taro.setClipboardData({ data: publishedUrl })
          }}
        >
          复制公共板链接
        </Button>
      )}

      <View className='public-publisher__management'>
        <View className='public-publisher__management-header'>
          <View className='public-publisher__management-copy'>
            <Text className='public-publisher__consent-title'>
              我的 CBoard 公共板
            </Text>
            <Text className='public-publisher__consent-hint'>
              同时显示这个账号从 Web 或微信发布的公共板。
            </Text>
          </View>
          <Button
            id='public-board-management-refresh'
            className='public-publisher__management-refresh'
            disabled={managementLoading || Boolean(managingBoardId)}
            onClick={() => void refreshOwnedPublicBoards()}
          >
            {managementLoading ? '读取中' : '刷新列表'}
          </Button>
        </View>
        <Text className='public-publisher__status'>
          {managementStatus}
        </Text>

        {ownedPublicBoards.map(board => {
          const busy = managingBoardId === board.id
          const boardUrl = `https://app.cboard.io/board/${board.id}`
          return (
            <View
              key={board.id}
              className='public-publisher__owned-board'
            >
              <Text className='public-publisher__owned-board-name'>
                {board.name}
              </Text>
              <Text className='public-publisher__consent-hint'>
                {String(board.description || '暂无用途说明')}
              </Text>
              <View className='public-publisher__owned-board-actions'>
                <Button
                  className='public-publisher__owned-board-action'
                  disabled={busy || Boolean(managingBoardId)}
                  onClick={() => {
                    void Taro.setClipboardData({ data: boardUrl })
                  }}
                >
                  复制链接
                </Button>
                <Button
                  className='public-publisher__owned-board-action'
                  disabled={busy || Boolean(managingBoardId)}
                  onClick={() => void unpublishOwnedBoard(board)}
                >
                  取消公开
                </Button>
                <Button
                  className='public-publisher__owned-board-delete'
                  disabled={busy || Boolean(managingBoardId)}
                  onClick={() => void deleteOwnedBoard(board)}
                >
                  {busy ? '处理中' : '永久删除'}
                </Button>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}
