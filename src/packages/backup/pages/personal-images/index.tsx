import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import type { PictogramAttribution } from '@cboard-communication-core/pictogramAttribution'
import type { PersonalImagePreference } from '@cboard-communication-core/personalImagePreferences'
import type { TileDTO } from '@cboard-communication-core/dto'
import {
  CURATED_PUBLIC_PICTOGRAM_ID_PREFIX,
  createCuratedPublicPictogram,
  removeCuratedPublicPictogram
} from '@cboard-communication-core/publicPictogramCuration'

import PersonalImageManager from '../../../../features/communication/PersonalImageManager'
import { createTaroCommunicationRepository } from '../../../../platform/taroCommunicationRepository'
import { taroPictureLibraryStore } from '../../../../platform/taroPictureLibraryStore'
import { rebasePersonalImageLibraryBoards } from '../../personalImageLibrary'
import CustomPictogramEditor from '../../CustomPictogramEditor'
import PublicBoardPublisher from '../../PublicBoardPublisher'
import {
  copyCustomPersonalPictogram,
  createCustomPersonalPictogram,
  moveCustomPersonalPictogram,
  removeCustomPersonalPictogram,
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
  const [libraryBoards, setLibraryBoards] = useState(
    loadLibraryBoards
  )
  const [preferences, setPreferences] = useState<
    PersonalImagePreference[]
  >(() => repository.loadPersonalImagePreferences())

  const reload = () => {
    setLibraryBoards(loadLibraryBoards())
    setPreferences(repository.loadPersonalImagePreferences())
  }

  useDidShow(reload)
  const boards = rebasePersonalImageLibraryBoards(libraryBoards)

  const savePersonalImage = (entry: {
    tileId: string
    boardId: string
    labelSnapshot: string
    image: string
    pictogramAttribution: PictogramAttribution
  }) => {
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

  const removeCustomPictogram = (
    boardId: string,
    tileId: string
  ) => {
    try {
      const current = taroPictureLibraryStore.load()
      const removed = removeCustomPersonalPictogram(
        current,
        boardId,
        tileId
      )
      if (!removed) return false
      const saved = taroPictureLibraryStore.save(removed.boards)
      setLibraryBoards(saved)
      return true
    } catch (error) {
      return false
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

  const removeCuratedPictogram = (
    boardId: string,
    tileId: string
  ) => {
    try {
      const current = taroPictureLibraryStore.load()
      const removed = removeCuratedPublicPictogram(
        current,
        boardId,
        tileId
      )
      if (!removed) return false
      setLibraryBoards(
        taroPictureLibraryStore.save(removed.boards)
      )
      return true
    } catch (error) {
      return false
    }
  }

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

      <PublicBoardPublisher boards={libraryBoards} />

      <CustomPictogramEditor
        boards={libraryBoards}
        onCreate={createCustomPictogram}
        onUpdate={updateCustomPictogram}
        onCopy={copyCustomPictogram}
        onMove={moveCustomPictogram}
        onRemove={removeCustomPictogram}
      />

      <PersonalImageManager
        boards={boards}
        preferences={preferences}
        onSave={savePersonalImage}
        onRemove={removePersonalImage}
        onCuratePublic={curatePublicPictogram}
        onRemoveCuratedPublic={removeCuratedPictogram}
        onOpenBoardManager={openBoardManager}
      />
    </View>
  )
}
