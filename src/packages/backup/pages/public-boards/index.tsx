import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import type { PublicBoardSummary } from '../../../../platform/publicBoardLibraryPort'
import { taroPublicBoardLibraryPort } from '../../../../platform/taroPublicBoardLibraryPort'
import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import { taroPictureLibraryArchivePort } from '../../../../platform/taroPictureLibraryArchivePort'
import { taroLocalDeviceDataPort } from '../../../../platform/taroLocalDeviceDataPort'
import { createPublicBoardLibraryService } from '../../publicBoardLibraryService'
import {
  PUBLIC_BOARD_SEARCH_PAGE_SIZE,
  hasMorePublicBoards,
  mergePublicBoardSearchPage
} from '../../publicBoardPagination'
import './index.css'

const service = createPublicBoardLibraryService({
  port: taroPublicBoardLibraryPort,
  boardStore: taroPictureLibraryStore,
  archivePort: taroPictureLibraryArchivePort,
  localDeviceDataPort: taroLocalDeviceDataPort
})

export default function PublicBoardLibraryPage() {
  const [query, setQuery] = useState('')
  const [boards, setBoards] = useState<PublicBoardSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [activeQuery, setActiveQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [importingId, setImportingId] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeOk, setNoticeOk] = useState(false)

  const searchBoards = async (
    searchText = query,
    requestedPage = 1,
    append = false
  ) => {
    if (loading) return
    setLoading(true)
    setNotice('')
    const normalizedSearch = searchText.trim()
    try {
      const result = await service.search({
        search: normalizedSearch,
        page: requestedPage,
        limit: PUBLIC_BOARD_SEARCH_PAGE_SIZE
      })
      setBoards(current =>
        mergePublicBoardSearchPage(current, result, append)
      )
      setTotal(result.total)
      setPage(result.page)
      setActiveQuery(normalizedSearch)
      if (!result.boards.length && !append) {
        setNotice('没有找到匹配的公共沟通板，可以换一个关键词。')
        setNoticeOk(false)
      } else if (!result.boards.length && append) {
        setNotice('已经加载全部公共沟通板。')
        setNoticeOk(true)
      }
    } catch (error) {
      if (!append) {
        setBoards([])
        setTotal(0)
        setPage(0)
        setActiveQuery(normalizedSearch)
      }
      setNotice(
        error instanceof Error
          ? error.message
          : '无法读取公共沟通板，请稍后重试。'
      )
      setNoticeOk(false)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!boards.length && !loading) void searchBoards('')
  })

  const loadMore = () => {
    if (loading || !hasMorePublicBoards(boards.length, total)) return
    void searchBoards(activeQuery, page + 1, true)
  }

  const importBoard = async (board: PublicBoardSummary) => {
    if (importingId) return
    const confirmation = await Taro.showModal({
      title: `导入“${board.name}”`,
      content:
        '公共板作者可能没有提供逐图许可证。请只导入你有权使用的内容；图语家会先尝试把安全代理图片全部保存到本机，失败时不会半导入。',
      confirmText: '保存并导入',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setImportingId(board.id)
    setNotice('')
    let result = await service.importBoard(board.id)
    if (!result.ok && result.canImportOnline) {
      const fallback = await Taro.showModal({
        title: '离线图片保存未完成',
        content:
          `${result.message} 是否仅导入文字和网络图片？` +
          '网络不可用时图片可能无法显示，但文字兜底仍会保留。',
        confirmText: '仅网络导入',
        cancelText: '暂不导入'
      })
      if (fallback.confirm) {
        result = await service.importBoard(board.id, { cacheImages: false })
      }
    }
    setNotice(result.message)
    setNoticeOk(result.ok)
    setImportingId('')
  }

  const returnToLibrary = () => {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.redirectTo({
        url: '/packages/backup/pages/personal-images/index'
      })
    )
  }

  return (
    <View className='public-board-page'>
      <View className='public-board-page__hero'>
        <Text className='public-board-page__eyebrow'>
          图语家 · 家属图片库
        </Text>
        <Text className='public-board-page__title'>查找公共沟通板</Text>
        <Text className='public-board-page__description'>
          复用 CBoard 社区已有沟通板。这里只维护图库，不会在患者表达页自动搜索或上传内容。
        </Text>
      </View>

      <View className='public-board-search'>
        <Input
          id='public-board-search-input'
          className='public-board-search__input'
          value={query}
          maxlength={80}
          placeholder='输入板名或作者，例如：日常、医院'
          onInput={event => setQuery(event.detail.value)}
          onConfirm={() => void searchBoards()}
        />
        <Button
          id='public-board-search-button'
          className='public-board-button public-board-button--primary'
          disabled={loading}
          onClick={() => void searchBoards()}
        >
          {loading ? '正在查找...' : '查找'}
        </Button>
      </View>

      <View className='public-board-warning'>
        <Text>导入前须知</Text>
        <Text>
          公共不等于自由授权。默认会通过 CBoard 安全代理保存图片到本机；无法完整保存时由家属决定是否仅保留网络链接，并始终保留文字兜底。
        </Text>
      </View>

      <View className='public-board-list'>
        <Text className='public-board-list__summary'>
          {loading ? '正在读取 CBoard 公共板...' : `找到 ${total} 个公共板`}
        </Text>
        {boards.map(board => (
          <View className='public-board-card' key={board.id}>
            <View className='public-board-card__copy'>
              <Text className='public-board-card__name'>{board.name}</Text>
              <Text className='public-board-card__meta'>
                作者：{board.author} · {board.tileCount} 张图卡
              </Text>
            </View>
            <Button
              id={`public-board-import-${board.id}`}
              className='public-board-button public-board-button--import'
              disabled={Boolean(importingId)}
              onClick={() => void importBoard(board)}
            >
              {importingId === board.id ? '正在导入...' : '导入图库'}
            </Button>
          </View>
        ))}
        {hasMorePublicBoards(boards.length, total) && (
          <Button
            id='public-board-load-more-button'
            className='public-board-button public-board-button--more'
            disabled={loading || Boolean(importingId)}
            onClick={loadMore}
          >
            {loading ? '正在加载...' : `加载更多（已显示 ${boards.length}/${total}）`}
          </Button>
        )}
      </View>

      {notice && (
        <View
          id='public-board-notice'
          className={
            noticeOk
              ? 'public-board-notice public-board-notice--ok'
              : 'public-board-notice public-board-notice--error'
          }
        >
          <Text>{notice}</Text>
        </View>
      )}

      <Button className='public-board-button' onClick={returnToLibrary}>
        返回图片库维护
      </Button>
    </View>
  )
}
