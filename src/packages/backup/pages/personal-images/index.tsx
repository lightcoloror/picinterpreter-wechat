import { useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'
import type { PersonalImagePreference } from '@cboard-communication-core/personalImagePreferences'
import type { TileDTO } from '@cboard-communication-core/dto'
import {
  CURATED_PUBLIC_PICTOGRAM_ID_PREFIX,
  createCuratedPublicPictogram,
  listCuratedPublicPictograms
} from '@cboard-communication-core/publicPictogramCuration'

import PersonalImageManager from '../../../../features/communication/PersonalImageManager'
import { runtimeCapabilities } from '../../../../config/runtimeCapabilities'
import { createTaroCommunicationRepository } from '../../../../platform/taroCommunicationRepository'
import { canEditCareLibrary, canEditCarePreferences, careScopedKey, currentCareContext } from '../../../../platform/taroCareContext'
import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import { currentGalleryUndoScope, taroGalleryTileUndo } from '../../../../platform/taroGalleryTileUndo'
import { rebasePersonalImageLibraryBoards } from '../../personalImageLibrary'
import CustomPictogramEditor from '../../CustomPictogramEditor'
import PublicBoardPublisher from '../../PublicBoardPublisher'
import {
  copyCustomPersonalPictogram,
  createCustomPersonalPictogram,
  listCustomPersonalPictograms,
  moveCustomPersonalPictogram,
  type CustomPersonalPictogramInput,
  updateCustomPersonalPictogram
} from '../../customPersonalPictogram'
import './index.css'

const repository = createTaroCommunicationRepository()

function loadLibraryBoards() {
  return taroPictureLibraryStore.load()
}

function createCuratedPictogramId() {
  return (
    CURATED_PUBLIC_PICTOGRAM_ID_PREFIX +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  )
}

export default function PersonalImageLibraryPage() {
  const activeRef = useRef(true)
  const pageRevisionRef = useRef(0)
  const pendingRef = useRef(false)
  const [galleryBusy, setGalleryBusy] = useState(false)
  const [galleryNotice, setGalleryNotice] = useState('')
  const [undoState, setUndoState] = useState(() => taroGalleryTileUndo.state())
  const [libraryBoards, setLibraryBoards] = useState(
    loadLibraryBoards
  )
  const [preferences, setPreferences] = useState<
    PersonalImagePreference[]
  >(() => repository.loadPersonalImagePreferences())
  const [canEditLibrary, setCanEditLibrary] = useState(() => canEditCareLibrary())
  const [canEditPreferences, setCanEditPreferences] = useState(() => canEditCarePreferences())
  const [storageMode, setStorageMode] = useState<'device' | 'care-profile'>(() => {
    const context = currentCareContext()
    return context?.profileId && context.accountId !== 'offline' ? 'care-profile' : 'device'
  })
  const [locked, setLocked] = useState(() => Boolean(
    currentCareContext()?.selection?.locked ||
    Taro.getStorageSync(careScopedKey('care-locked'))
  ))
  const renderedScope = currentGalleryUndoScope()
  const [loadedScope, setLoadedScope] = useState(renderedScope)
  const scopeStillCurrent = () => {
    return renderedScope === currentGalleryUndoScope()
  }

  const refreshPermission = () => {
    const context = currentCareContext()
    const isLocked = Boolean(context?.selection?.locked || Taro.getStorageSync(careScopedKey('care-locked')))
    setCanEditLibrary(canEditCareLibrary(context))
    setCanEditPreferences(canEditCarePreferences(context))
    setStorageMode(context?.profileId && context.accountId !== 'offline' ? 'care-profile' : 'device')
    setLocked(isLocked)
  }

  const reload = () => {
    refreshPermission()
    const context = currentCareContext()
    const nextScope = currentGalleryUndoScope()
    setLoadedScope(nextScope)
    if (context?.selection?.locked || Taro.getStorageSync(careScopedKey('care-locked'))) {
      setLibraryBoards([])
      setPreferences([])
      return
    }
    setLibraryBoards(loadLibraryBoards())
    setPreferences(repository.loadPersonalImagePreferences())
  }

  useDidShow(() => { activeRef.current = true; reload() })
  useDidHide(() => { activeRef.current = false; pageRevisionRef.current += 1 })
  useEffect(() => {
    pageRevisionRef.current += 1
    setUndoState(taroGalleryTileUndo.state())
    setGalleryNotice('')
  }, [renderedScope])
  useEffect(() => {
    activeRef.current = true
    const unsubscribe = taroGalleryTileUndo.subscribe(setUndoState)
    return () => { activeRef.current = false; pageRevisionRef.current += 1; unsubscribe() }
  }, [])
  useEffect(() => {
    const changed = () => {
      setLibraryBoards([])
      setPreferences([])
      reload()
    }
    Taro.eventCenter.on('care-content-changed', changed)
    Taro.eventCenter.on('care-identity-changed', changed)
    return () => {
      Taro.eventCenter.off('care-content-changed', changed)
      Taro.eventCenter.off('care-identity-changed', changed)
    }
  }, [])
  const scopeIsLoaded = loadedScope === renderedScope
  const visibleLibraryBoards = scopeIsLoaded && !locked ? libraryBoards : []
  const visiblePreferences = scopeIsLoaded && !locked ? preferences : []
  const boards = rebasePersonalImageLibraryBoards(visibleLibraryBoards)

  const savePersonalImage = (entry: {
    tileId: string
    boardId: string
    labelSnapshot: string
    image: string
    pictogramAttribution: PictogramAttribution
  }) => {
    if (!scopeStillCurrent() || !canEditCarePreferences()) return false
    try {
      const saved = repository.savePersonalImagePreference(entry)
      if (!saved) return false

      setPreferences(repository.loadPersonalImagePreferences())
      return true
    } catch (error) {
      return false
    }
  }

  const removePersonalImage = (
    tileId: string,
    boardId: string
  ) => {
    if (!scopeStillCurrent() || !canEditCarePreferences()) return false
    try {
      const removed = repository.removePersonalImagePreference(
        tileId,
        { boardId }
      )
      if (!removed) return false

      setPreferences(repository.loadPersonalImagePreferences())
      return true
    } catch (error) {
      return false
    }
  }

  const createCustomPictogram = (
    value: CustomPersonalPictogramInput
  ) => {
    if (!scopeStillCurrent() || !canEditCareLibrary()) return false
    try {
      const current = taroPictureLibraryStore.load()
      const created = createCustomPersonalPictogram(current, value)
      const saved = taroPictureLibraryStore.save(created.boards)
      setLibraryBoards(saved)
      return true
    } catch (error) {
      return false
    }
  }

  const removeCustomPictogram = async (
    boardId: string,
    tileId: string,
    options: { guard?: () => boolean } = {}
  ) => {
    const pageRevision = pageRevisionRef.current
    const guard = () => activeRef.current && pageRevision === pageRevisionRef.current && scopeStillCurrent() &&
      canEditCareLibrary() && (!options.guard || options.guard())
    if (pendingRef.current || !guard()) return false
    const current = loadLibraryBoards()
    const removable = [...listCustomPersonalPictograms(current), ...listCuratedPublicPictograms(current)]
      .some(entry => entry.boardId === boardId && entry.tile.id === tileId)
    // A retry can legitimately find the tile already absent after a previous
    // write whose confirmation was interrupted. The service owns that receipt.
    if (!removable && current.some(board => board.id === boardId && board.tiles.some(tile => tile.id === tileId))) return false
    pendingRef.current = true
    setGalleryBusy(true)
    setGalleryNotice('正在确认删除…')
    try {
      const result = await taroGalleryTileUndo.delete(boardId, tileId, { guard })
      if (!guard()) return false
      if (!result.board) {
        setGalleryNotice('删除尚未确认，请重试；图片和已有表达记录保持保留。')
        return false
      }
      setLibraryBoards(loadLibraryBoards())
      setUndoState(taroGalleryTileUndo.state())
      setGalleryNotice(`已删除「${result.label || '图卡'}」，可撤销。`)
      return true
    } catch (error) {
      if (guard()) setGalleryNotice('删除尚未确认，请重试；图片和已有表达记录保持保留。')
      return false
    } finally {
      pendingRef.current = false
      if (activeRef.current) setGalleryBusy(false)
    }
  }

  const undoGalleryDelete = async () => {
    const operationId = undoState.operationId
    const pageRevision = pageRevisionRef.current
    const guard = () => activeRef.current && pageRevision === pageRevisionRef.current && scopeStillCurrent() && canEditCareLibrary()
    if (!operationId || pendingRef.current || !guard()) return
    pendingRef.current = true
    setGalleryBusy(true)
    setGalleryNotice('正在恢复图卡…')
    try {
      const result = await taroGalleryTileUndo.undo(operationId, { guard })
      if (!guard()) return
      if (!result.board) {
        setGalleryNotice('恢复尚未确认，撤销记录仍保留；请重试。')
        return
      }
      setLibraryBoards(loadLibraryBoards())
      setUndoState(taroGalleryTileUndo.state())
      setGalleryNotice('已恢复图卡，原图片和人物身份保持不变。')
    } catch (error) {
      if (guard()) setGalleryNotice('恢复尚未确认，撤销记录仍保留；请重试。')
    } finally {
      pendingRef.current = false
      if (activeRef.current) setGalleryBusy(false)
    }
  }

  const copyCustomPictogram = (
    sourceBoardId: string,
    tileId: string,
    value: {
      id: string
      targetBoardId: string
    }
  ) => {
    if (!scopeStillCurrent() || !canEditCareLibrary()) return false
    try {
      const current = taroPictureLibraryStore.load()
      const copied = copyCustomPersonalPictogram(
        current,
        sourceBoardId,
        tileId,
        value
      )
      if (!copied) return false
      const saved = taroPictureLibraryStore.save(copied.boards)
      setLibraryBoards(saved)
      return true
    } catch (error) {
      return false
    }
  }

  const updateCustomPictogram = (
    sourceBoardId: string,
    value: CustomPersonalPictogramInput
  ) => {
    if (!scopeStillCurrent() || !canEditCareLibrary()) return false
    try {
      const current = taroPictureLibraryStore.load()
      const updated = updateCustomPersonalPictogram(
        current,
        sourceBoardId,
        value
      )
      if (!updated) return false
      const saved = taroPictureLibraryStore.save(updated.boards)
      setLibraryBoards(saved)
      return true
    } catch (error) {
      return false
    }
  }

  const moveCustomPictogram = (
    boardId: string,
    tileId: string,
    direction: 'earlier' | 'later'
  ) => {
    if (!scopeStillCurrent() || !canEditCareLibrary()) return false
    try {
      const current = taroPictureLibraryStore.load()
      const moved = moveCustomPersonalPictogram(
        current,
        boardId,
        tileId,
        direction
      )
      if (!moved || !moved.changed) return false
      const saved = taroPictureLibraryStore.save(moved.boards)
      setLibraryBoards(saved)
      return true
    } catch (error) {
      return false
    }
  }

  const curatePublicPictogram = (entry: {
    sourceTile: TileDTO
    targetBoardId: string
  }) => {
    if (!scopeStillCurrent() || !canEditCareLibrary()) return false
    try {
      const current = taroPictureLibraryStore.load()
      const created = createCuratedPublicPictogram(current, {
        id: createCuratedPictogramId(),
        targetBoardId: entry.targetBoardId,
        sourceTile: entry.sourceTile
      })
      setLibraryBoards(
        taroPictureLibraryStore.save(created.boards)
      )
      return true
    } catch (error) {
      return false
    }
  }

  const removeCuratedPictogram = removeCustomPictogram

  const returnToCommunication = () => {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' })
    )
  }

  const openPublicBoards = () => {
    void Taro.navigateTo({
      url: '/packages/backup/pages/public-boards/index'
    })
  }

  const openBoardManager = () => {
    void Taro.navigateTo({
      url: '/packages/backup/pages/boards/index'
    })
  }

  return (
    <View className='personal-image-page'>
      <View className='personal-image-page__header'>
        <View>
          <Text className='personal-image-page__eyebrow'>
            图语家 · 家属设置
          </Text>
          <Text className='personal-image-page__title'>
            图片库维护
          </Text>
        </View>
        <Button
          className='utility-page__back'
          onClick={returnToCommunication}
        >
          返回上一页
        </Button>
      </View>

      {!locked && canEditLibrary && scopeIsLoaded && (galleryNotice || undoState.count > 0) && (
        <View className='gallery-delete-undo' id='gallery-delete-undo'>
          <Text id='gallery-delete-undo-status'>{galleryNotice || `可撤销最近删除的「${undoState.label || '图卡'}」。`}</Text>
          {undoState.operationId && <Button
            id='gallery-delete-undo-button'
            disabled={galleryBusy}
            onClick={() => void undoGalleryDelete()}
          >{galleryBusy ? '正在确认…' : `撤销删除（${undoState.count}）`}</Button>}
          <Text className='gallery-delete-undo__hint'>本次会话保留最近 20 次删除，图片及已有表达记录保持保留。</Text>
        </View>
      )}

      {locked ? (
        <Text className='personal-image-manager__privacy'>当前家庭档案已锁定，图片资料暂不可查看；解锁后重新进入此页。</Text>
      ) : runtimeCapabilities.cloudFeatures && (
        <View className='public-board-cloud-tools'>
          <View className='public-library-entry'>
            <View>
              <Text className='public-library-entry__title'>
                从 CBoard 公共板补充图库
              </Text>
              <Text className='public-library-entry__hint'>
                按板名或作者跨分类查找，只在家属维护区导入；不会干扰患者当前表达。
              </Text>
            </View>
            <Button
              id='open-public-board-library-button'
              className='public-library-entry__button'
              onClick={openPublicBoards}
            >
              查找公共沟通板
            </Button>
          </View>

          {canEditLibrary && scopeIsLoaded && <PublicBoardPublisher boards={visibleLibraryBoards} />}
        </View>
      )}

      <CustomPictogramEditor
        key={`${renderedScope}:${canEditLibrary}`}
        boards={visibleLibraryBoards}
        canEdit={canEditLibrary}
        storageMode={storageMode}
        onCreate={createCustomPictogram}
        onUpdate={updateCustomPictogram}
        onCopy={copyCustomPictogram}
        onMove={moveCustomPictogram}
        onRemove={removeCustomPictogram}
      />

      <PersonalImageManager
        key={`${renderedScope}:${canEditPreferences}:${canEditLibrary}`}
        boards={boards}
        preferences={visiblePreferences}
        canEditPreferences={canEditPreferences}
        canEditLibrary={canEditLibrary}
        storageMode={storageMode}
        onSave={savePersonalImage}
        onRemove={removePersonalImage}
        onCuratePublic={curatePublicPictogram}
        onRemoveCuratedPublic={removeCuratedPictogram}
        onOpenBoardManager={openBoardManager}
      />
    </View>
  )
}
