import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX,
  PERSONAL_COMMUNICATION_BOARD_ID_PREFIX,
  addCommunicationBoardLink,
  createPersonalCommunicationBoard,
  isPersonalCommunicationBoard,
  moveCommunicationBoard,
  removeCommunicationBoardLink,
  removePersonalCommunicationBoard,
  renamePersonalCommunicationBoard,
  wouldCreateCommunicationBoardLinkCycle
} from '@cboard-communication-core/boardManagement'
import type { BoardDTO } from '@cboard-communication-core/dto'

import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import './index.css'

function createPersonalBoardId() {
  return (
    PERSONAL_COMMUNICATION_BOARD_ID_PREFIX +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  )
}

function createPersonalBoardLinkId() {
  return (
    PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  )
}

function getBoardLinkImage(board: BoardDTO) {
  const imageTile = board.tiles.find(tile => !tile.loadBoardId && tile.image)
  return imageTile ? imageTile.image : ''
}

export default function BoardManagementPage() {
  const [boards, setBoards] = useState<BoardDTO[]>(() =>
    taroPictureLibraryStore.load()
  )
  const [newName, setNewName] = useState('')
  const [editingBoardId, setEditingBoardId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [linkingBoardId, setLinkingBoardId] = useState('')
  const [notice, setNotice] = useState(
    '板块顺序会影响照护者浏览顺序；患者常用优先模式仍按实际使用次数显示。'
  )

  useDidShow(() => {
    setBoards(taroPictureLibraryStore.load())
  })

  const persist = (nextBoards: BoardDTO[], message: string) => {
    try {
      setBoards(taroPictureLibraryStore.save(nextBoards))
      setNotice(message)
      return true
    } catch (error) {
      setNotice('板块保存失败，原图库未发生变化，请重试。')
      return false
    }
  }

  const addBoard = () => {
    if (!newName.trim()) {
      setNotice('请先填写新板块名称。')
      return
    }
    try {
      const result = createPersonalCommunicationBoard(boards, {
        id: createPersonalBoardId(),
        name: newName,
        columns: 3
      })
      if (persist(result.boards, `已新增个人板块“${result.board.name}”。`)) {
        setNewName('')
      }
    } catch (error) {
      setNotice('板块名称不能为空或重复，请换一个名称。')
    }
  }

  const startRename = (board: BoardDTO) => {
    setEditingBoardId(board.id)
    setEditingName(board.name)
    setNotice('修改后点击“保存名称”；取消不会改变原板块。')
  }

  const saveRename = () => {
    try {
      const nextBoards = renamePersonalCommunicationBoard(
        boards,
        editingBoardId,
        editingName
      )
      if (persist(nextBoards, '个人板块名称已更新。')) {
        setEditingBoardId('')
        setEditingName('')
      }
    } catch (error) {
      setNotice('只能修改个人板块，且名称不能为空或与现有板块重复。')
    }
  }

  const moveBoard = (
    boardId: string,
    direction: 'up' | 'down'
  ) => {
    try {
      const nextBoards = moveCommunicationBoard(
        boards,
        boardId,
        direction
      )
      if (nextBoards === boards) {
        setNotice(direction === 'up' ? '已经是第一个板块。' : '已经是最后一个板块。')
        return
      }
      persist(nextBoards, '板块顺序已保存。')
    } catch (error) {
      setNotice('板块排序失败，原顺序未发生变化。')
    }
  }

  const addBoardLink = (sourceBoard: BoardDTO, targetBoard: BoardDTO) => {
    try {
      const result = addCommunicationBoardLink(boards, {
        sourceBoardId: sourceBoard.id,
        targetBoardId: targetBoard.id,
        tileId: createPersonalBoardLinkId(),
        image: getBoardLinkImage(targetBoard)
      })
      persist(
        result.boards,
        `已在“${sourceBoard.name}”中加入前往“${targetBoard.name}”的跳转。`
      )
    } catch (error) {
      setNotice('无法添加跳转：不能重复、指向自身或形成循环路径。')
    }
  }

  const removeBoardLink = (sourceBoard: BoardDTO, targetBoardId: string) => {
    const targetBoard = boards.find(board => board.id === targetBoardId)
    const targetName = targetBoard ? targetBoard.name : '已失效板块'
    try {
      const nextBoards = removeCommunicationBoardLink(
        boards,
        sourceBoard.id,
        targetBoardId
      )
      persist(
        nextBoards,
        `已从“${sourceBoard.name}”移除前往“${targetName}”的跳转。`
      )
    } catch (error) {
      setNotice('跳转移除失败，原图库未发生变化，请重试。')
    }
  }

  const removeBoard = async (board: BoardDTO) => {
    if (!isPersonalCommunicationBoard(board)) {
      setNotice('CBoard 内置板块不会在小程序中删除，可在照护设置里隐藏。')
      return
    }
    if (board.tiles.length) {
      setNotice('请先移除该板块内的个人图卡和板间跳转，再删除板块。')
      return
    }
    const confirmation = await Taro.showModal({
      title: '删除个人板块',
      content: `确定删除空板块“${board.name}”吗？此操作不能撤销。`,
      confirmText: '删除',
      confirmColor: '#b42318',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    try {
      const nextBoards = removePersonalCommunicationBoard(
        boards,
        board.id
      )
      persist(nextBoards, `已删除个人板块“${board.name}”。`)
    } catch (error) {
      setNotice('该板块仍有图卡或导航引用，未执行删除。')
    }
  }

  const returnToCommunication = () => {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' })
    )
  }

  const openPersonalImages = () => {
    void Taro.navigateTo({
      url: '/packages/backup/pages/personal-images/index'
    }).catch(() => {
      setNotice('暂时无法打开个人图片管理，请重试。')
    })
  }

  return (
    <View className='board-management-page'>
      <View className='board-management-page__header'>
        <View>
          <Text className='board-management-page__eyebrow'>
            图语家 · 照护工具
          </Text>
          <Text className='board-management-page__title'>
            板块管理
          </Text>
        </View>
        <Button
          className='board-management-page__back'
          onClick={returnToCommunication}
        >
          返回沟通
        </Button>
      </View>

      <View className='board-management-create'>
        <View>
          <Text className='board-management-section__title'>
            新建个人板块
          </Text>
          <Text className='board-management-section__hint'>
            个人板块只保存在本机，可在“个人图片”中把自定义图卡放入该板块。
          </Text>
        </View>
        <View className='board-management-create__form'>
          <Input
            id='new-personal-board-name-input'
            className='board-management-input'
            value={newName}
            maxlength={40}
            placeholder='例如：家人、我的常用物品'
            onInput={event => setNewName(event.detail.value)}
          />
          <Button
            id='create-personal-board-button'
            className='board-management-button board-management-button--primary'
            onClick={addBoard}
          >
            新增板块
          </Button>
        </View>
      </View>

      <View className='board-management-notice' aria-live='polite'>
        <Text>{notice}</Text>
      </View>

      <View className='board-management-list'>
        <View className='board-management-list__heading'>
          <Text className='board-management-section__title'>
            当前板块
          </Text>
          <Text className='board-management-section__hint'>
            共 {boards.length} 个；内置板块可排序和隐藏，但不会在这里误删。
          </Text>
        </View>

        {boards.map((board, index) => {
          const personal = isPersonalCommunicationBoard(board)
          const editing = editingBoardId === board.id
          const linking = linkingBoardId === board.id
          const navigationTiles = board.tiles.filter(tile => tile.loadBoardId)
          const managedNavigationTiles = navigationTiles.filter(tile =>
            tile.id.startsWith(PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX)
          )
          const nativeNavigationTiles = navigationTiles.filter(
            tile =>
              !tile.id.startsWith(
                PERSONAL_COMMUNICATION_BOARD_LINK_ID_PREFIX
              )
          )
          const contentTileCount = board.tiles.length - navigationTiles.length
          const linkedBoardIds = new Set(
            navigationTiles.map(tile => tile.loadBoardId)
          )
          const availableTargets = boards.filter(
            target => target.id !== board.id && !linkedBoardIds.has(target.id)
          )
          return (
            <View
              key={board.id}
              className='board-management-card'
              id={`board-management-card-${board.id}`}
            >
              <View className='board-management-card__summary'>
                <Text className='board-management-card__position'>
                  {index + 1}
                </Text>
                <View className='board-management-card__copy'>
                  <Text className='board-management-card__name'>
                    {board.name}
                  </Text>
                  <Text className='board-management-card__meta'>
                    {contentTileCount} 张图卡 · {navigationTiles.length} 个跳转 · {personal ? '本机个人板块' : 'CBoard 内置板块'}
                  </Text>
                </View>
              </View>

              {editing && (
                <View className='board-management-rename'>
                  <Input
                    id={`rename-personal-board-input-${board.id}`}
                    className='board-management-input'
                    value={editingName}
                    maxlength={40}
                    focus
                    onInput={event => setEditingName(event.detail.value)}
                  />
                  <Button
                    id={`save-personal-board-name-${board.id}`}
                    className='board-management-button board-management-button--primary'
                    onClick={saveRename}
                  >
                    保存名称
                  </Button>
                  <Button
                    className='board-management-button'
                    onClick={() => {
                      setEditingBoardId('')
                      setEditingName('')
                      setNotice('已取消改名，原板块未发生变化。')
                    }}
                  >
                    取消
                  </Button>
                </View>
              )}

              <View className='board-management-card__actions'>
                <Button
                  id={`move-board-up-${board.id}`}
                  className='board-management-button'
                  disabled={index === 0}
                  onClick={() => moveBoard(board.id, 'up')}
                >
                  上移
                </Button>
                <Button
                  id={`move-board-down-${board.id}`}
                  className='board-management-button'
                  disabled={index === boards.length - 1}
                  onClick={() => moveBoard(board.id, 'down')}
                >
                  下移
                </Button>
                {!editing && (
                  <Button
                    id={`board-link-toggle-${board.id}`}
                    className='board-management-button'
                    onClick={() => {
                      setLinkingBoardId(linking ? '' : board.id)
                      setNotice(
                        linking
                          ? '已收起板间跳转管理。'
                          : '可把其他板块作为文件夹入口加入当前个人板块。'
                      )
                    }}
                  >
                    {linking ? '收起跳转' : '管理跳转'}
                  </Button>
                )}
                {personal && !editing && (
                  <Button
                    id={`rename-personal-board-${board.id}`}
                    className='board-management-button'
                    onClick={() => startRename(board)}
                  >
                    改名
                  </Button>
                )}
                {personal && !editing && (
                  <Button
                    id={`delete-personal-board-${board.id}`}
                    className='board-management-button board-management-button--danger'
                    onClick={() => {
                      void removeBoard(board)
                    }}
                  >
                    删除
                  </Button>
                )}
              </View>

              {linking && (
                <View className='board-management-links'>
                  <Text className='board-management-links__title'>
                    “{board.name}”里的板间跳转
                  </Text>
                  <Text className='board-management-section__hint'>
                    {personal
                      ? '跳转会显示为“进入”文件夹，不会加入患者的表达句子。'
                      : '可为内置板增加本机入口；CBoard 原有跳转保持只读。'}
                  </Text>

                  {nativeNavigationTiles.length > 0 && (
                    <Text className='board-management-links__empty'>
                      CBoard 原有 {nativeNavigationTiles.length} 个跳转保持不变。
                    </Text>
                  )}

                  <View className='board-management-links__group'>
                    <Text className='board-management-links__label'>
                      本机已加入
                    </Text>
                    {managedNavigationTiles.length === 0 ? (
                      <Text className='board-management-links__empty'>
                        还没有本机新增的板间跳转。
                      </Text>
                    ) : (
                      managedNavigationTiles.map(tile => {
                        const target = boards.find(
                          item => item.id === tile.loadBoardId
                        )
                        return (
                          <View
                            className='board-management-link-row'
                            key={tile.id}
                          >
                            <Text className='board-management-link-row__name'>
                              {target
                                ? target.name
                                : `${tile.label}（目标已失效）`}
                            </Text>
                            <Button
                              id={`board-link-remove-${board.id}-${tile.loadBoardId}`}
                              className='board-management-button board-management-button--danger board-management-link-row__button'
                              onClick={() =>
                                removeBoardLink(board, tile.loadBoardId)
                              }
                            >
                              移除
                            </Button>
                          </View>
                        )
                      })
                    )}
                  </View>

                  {availableTargets.length > 0 && (
                    <View className='board-management-links__group'>
                      <Text className='board-management-links__label'>
                        点击加入
                      </Text>
                      <View className='board-management-links__choices'>
                        {availableTargets.map(target => {
                          const createsCycle =
                            wouldCreateCommunicationBoardLinkCycle(
                              boards,
                              board.id,
                              target.id
                            )
                          return (
                            <Button
                              id={`board-link-add-${board.id}-${target.id}`}
                              className='board-management-button board-management-link-choice'
                              key={target.id}
                              disabled={createsCycle}
                              onClick={() => addBoardLink(board, target)}
                            >
                              {target.name}
                              {createsCycle ? '（会循环）' : ''}
                            </Button>
                          )
                        })}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )
        })}
      </View>

      <View className='board-management-help'>
        <Text className='board-management-section__title'>
          板块里已有个人图卡或跳转？
        </Text>
        <Text className='board-management-section__hint'>
          先移动或删除图卡，并在“管理跳转”中移除入口，再回来删除空板块。
        </Text>
        <Button
          className='board-management-button board-management-button--primary'
          onClick={openPersonalImages}
        >
          打开个人图片
        </Button>
      </View>
    </View>
  )
}
