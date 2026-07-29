import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Input,
  Picker,
  Text,
  View
} from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { BoardDTO } from '@cboard-communication-core/dto'

import PictogramImage from '../../components/PictogramImage'
import { taroPersonalImagePort } from '../../platform/taroPersonalImagePort'
import { taroPersonalVideoPort } from '../../platform/taroPersonalVideoPort'
import { taroTileAudioRecordingPort } from '../../platform/taroTileAudioRecordingPort'
import { wechatTileAudioPort } from '../../platform/taroSpeechPort'
import { createDraftImageRegistry } from './draftImageRegistry'
import { createDraftSoundRegistry } from './draftSoundRegistry'
import { createDraftVideoRegistry } from './draftVideoRegistry'
import {
  isCustomPictogramMediaReferencedElsewhere,
  listCustomPersonalPictograms,
  type CopyCustomPersonalPictogramInput,
  type CustomPersonalPictogramEntry,
  type CustomPersonalPictogramInput
} from './customPersonalPictogram'
import { taroBackgroundRemovalPort } from './taroBackgroundRemovalPort'
import { taroPictogramMetadataSuggestionPort } from './taroPictogramMetadataSuggestionPort'
import './CustomPictogramEditor.css'

interface CustomPictogramEditorProps {
  boards: BoardDTO[]
  onCreate: (value: CustomPersonalPictogramInput) => boolean
  onUpdate: (
    sourceBoardId: string,
    value: CustomPersonalPictogramInput
  ) => boolean
  onCopy: (
    sourceBoardId: string,
    tileId: string,
    value: CopyCustomPersonalPictogramInput
  ) => boolean
  onMove: (
    boardId: string,
    tileId: string,
    direction: 'earlier' | 'later'
  ) => boolean
  onRemove: (boardId: string, tileId: string) => boolean
}

interface Draft {
  boardId: string
  image: string
  mediaType: 'image' | 'gif' | 'video'
  video: string
  sound: string
  label: string
  vocalization: string
  synonyms: string
  category: string
  author: string
  license: string
}

function emptyDraft(boardId: string): Draft {
  return {
    boardId,
    image: '',
    mediaType: 'image',
    video: '',
    sound: '',
    label: '',
    vocalization: '',
    synonyms: '',
    category: '',
    author: '',
    license: '用户提供，仅限本机使用'
  }
}

function draftFromEntry(entry: CustomPersonalPictogramEntry): Draft {
  const attribution = entry.tile.pictogramAttribution
  return {
    boardId: entry.boardId,
    image: entry.tile.image,
    mediaType: entry.tile.mediaType || 'image',
    video: entry.tile.video || '',
    sound: entry.tile.sound || '',
    label: entry.tile.label,
    vocalization: entry.tile.vocalization,
    synonyms: entry.tile.communication.synonyms.join(','),
    category: entry.tile.communication.category,
    author: (attribution && attribution.author) || '',
    license:
      (attribution && attribution.license) ||
      '用户提供，仅限本机使用'
  }
}

function createPrivateTileId() {
  return (
    'device_private_custom_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  )
}

async function removeLocalImages(images: string[]) {
  for (const image of images) {
    await taroPersonalImagePort.remove(image)
  }
}

async function removeLocalSounds(sounds: string[]) {
  for (const sound of sounds) {
    await taroTileAudioRecordingPort.remove(sound)
  }
}

async function removeLocalVideos(videos: string[]) {
  for (const video of videos) {
    await taroPersonalVideoPort.remove(video)
  }
}

export default function CustomPictogramEditor({
  boards,
  onCreate,
  onUpdate,
  onCopy,
  onMove,
  onRemove
}: CustomPictogramEditorProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(boards[0] ? boards[0].id : '')
  )
  const [busyAction, setBusyAction] = useState('')
  const [isRecordingSound, setIsRecordingSound] = useState(false)
  const [originalImage, setOriginalImage] = useState('')
  const [copyTargetBoardId, setCopyTargetBoardId] = useState('')
  const [editingEntry, setEditingEntry] =
    useState<CustomPersonalPictogramEntry | null>(null)
  const [notice, setNotice] = useState(
    '新图卡默认只保存在当前微信设备；只有明确同意时才会单次上传以生成建议。'
  )
  const draftImageRegistryRef = useRef(createDraftImageRegistry())
  const draftSoundRegistryRef = useRef(createDraftSoundRegistry())
  const draftVideoRegistryRef = useRef(createDraftVideoRegistry())
  const requestIdRef = useRef(0)
  const soundRequestIdRef = useRef(0)
  const customEntries = useMemo(
    () => listCustomPersonalPictograms(boards),
    [boards]
  )
  const boardNames = boards.map(board => board.name)
  const boardIndex = Math.max(
    0,
    boards.findIndex(board => board.id === draft.boardId)
  )
  const copyTargetBoardIndex = Math.max(
    0,
    boards.findIndex(board => board.id === copyTargetBoardId)
  )
  const copyTargetBoard = boards[copyTargetBoardIndex]
  const controlsBusy = Boolean(busyAction) || isRecordingSound

  useEffect(() => {
    if (
      boards.length &&
      !boards.some(board => board.id === draft.boardId)
    ) {
      setDraft(current => ({
        ...current,
        boardId: boards[0].id
      }))
    }
  }, [boards, draft.boardId])

  useEffect(() => {
    if (!boards.length) {
      if (copyTargetBoardId) setCopyTargetBoardId('')
      return
    }
    if (!boards.some(board => board.id === copyTargetBoardId)) {
      setCopyTargetBoardId(boards[0].id)
    }
  }, [boards, copyTargetBoardId])

  useEffect(
    () => () => {
      requestIdRef.current += 1
      soundRequestIdRef.current += 1
      const transition = draftImageRegistryRef.current.discardAll()
      for (const image of transition.discard) {
        void taroPersonalImagePort.remove(image)
      }
      const videoTransition =
        draftVideoRegistryRef.current.discardAll()
      for (const video of videoTransition.discard) {
        void taroPersonalVideoPort.remove(video)
      }
      taroTileAudioRecordingPort.cancel()
      wechatTileAudioPort.stop()
      const soundTransition =
        draftSoundRegistryRef.current.discardAll()
      for (const sound of soundTransition.discard) {
        void taroTileAudioRecordingPort.remove(sound)
      }
    },
    []
  )

  const updateField = (field: keyof Draft, value: string) => {
    setDraft(current => ({ ...current, [field]: value }))
  }

  const startEditing = async (
    entry: CustomPersonalPictogramEntry
  ) => {
    requestIdRef.current += 1
    soundRequestIdRef.current += 1
    taroTileAudioRecordingPort.cancel()
    wechatTileAudioPort.stop()
    setIsRecordingSound(false)
    const transition = draftImageRegistryRef.current.discardAll()
    await removeLocalImages(transition.discard)
    const soundTransition =
      draftSoundRegistryRef.current.begin(entry.tile.sound || '')
    await removeLocalSounds(soundTransition.discard)
    const videoTransition =
      draftVideoRegistryRef.current.begin(entry.tile.video || '')
    await removeLocalVideos(videoTransition.discard)
    setOriginalImage('')
    setEditingEntry(entry)
    setDraft(draftFromEntry(entry))
    setNotice(
      '正在编辑已保存图卡；图片保持不变，名称、朗读、同义词、分类、来源说明和板块均可修改。'
    )
  }

  const cancelEditing = () => {
    const boardId =
      (editingEntry && editingEntry.boardId) || draft.boardId
    setEditingEntry(null)
    setOriginalImage('')
    setDraft(emptyDraft(boardId))
    soundRequestIdRef.current += 1
    taroTileAudioRecordingPort.cancel()
    wechatTileAudioPort.stop()
    setIsRecordingSound(false)
    const soundTransition =
      draftSoundRegistryRef.current.discardAll()
    void removeLocalSounds(soundTransition.discard)
    const videoTransition =
      draftVideoRegistryRef.current.discardAll()
    void removeLocalVideos(videoTransition.discard)
    setNotice('已取消修改，原图卡未发生变化。')
  }

  const choosePhoto = async (withSuggestion: boolean) => {
    if (editingEntry) return
    if (withSuggestion) {
      const consent = await Taro.showModal({
        title: '单次视觉识别授权',
        content:
          '所选照片将发送给已配置的视觉模型一次，用于建议标签、同义词和分类。CBoard API 不保存原图；模型提供方仍受其自身条款约束。是否继续？',
        confirmText: '同意并继续',
        cancelText: '取消'
      })
      if (!consent.confirm) return
    }

    setBusyAction('photo')
    const selected = await taroPersonalImagePort.selectAndSave()
    if (!selected.ok || !selected.image) {
      setNotice(selected.message)
      setBusyAction('')
      return
    }

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const videoTransition = draftVideoRegistryRef.current.clear()
    const transition =
      draftImageRegistryRef.current.replace(selected.image)
    setOriginalImage('')
    setDraft(current => ({
      ...current,
      image: transition.image,
      mediaType: selected.mediaType || 'image',
      video: videoTransition.video
    }))
    await removeLocalImages(transition.discard)
    await removeLocalVideos(videoTransition.discard)

    if (!withSuggestion) {
      setNotice('照片已保存在本机草稿中，请手工填写全部字段。')
      setBusyAction('')
      return
    }

    setNotice('照片已保存在本机，正在异步生成可编辑建议…')
    const result =
      await taroPictogramMetadataSuggestionPort.suggest(selected.image)
    if (requestId !== requestIdRef.current) return
    if (result.ok && result.value) {
      const suggestion = result.value
      setDraft(current => ({
        ...current,
        label: current.label || suggestion.label || '',
        vocalization:
          current.vocalization ||
          current.label ||
          suggestion.label ||
          '',
        synonyms:
          current.synonyms ||
          (suggestion.synonyms || []).join(','),
        category: current.category || suggestion.category || ''
      }))
    }
    setNotice(result.message)
    setBusyAction('')
  }

  const chooseVideo = async () => {
    if (editingEntry) return
    setBusyAction('video')
    const selected = await taroPersonalVideoPort.selectAndSave()
    if (!selected.ok || !selected.image || !selected.video) {
      setNotice(selected.message)
      setBusyAction('')
      return
    }

    requestIdRef.current += 1
    const imageTransition =
      draftImageRegistryRef.current.replace(selected.image)
    const videoTransition =
      draftVideoRegistryRef.current.replace(selected.video)
    setOriginalImage('')
    setDraft(current => ({
      ...current,
      image: imageTransition.image,
      mediaType: 'video',
      video: videoTransition.video
    }))
    await removeLocalImages(imageTransition.discard)
    await removeLocalVideos(videoTransition.discard)
    setNotice('短视频已保存在本机草稿中，请手工确认名称和朗读文字。')
    setBusyAction('')
  }

  const removeBackground = async () => {
    if (
      editingEntry ||
      draft.mediaType === 'video' ||
      !draft.image ||
      originalImage
    ) return
    if (!taroBackgroundRemovalPort.configured) {
      setNotice(
        '去背景服务尚未配置，原图仍保留，可继续直接使用。'
      )
      return
    }
    const consent = await Taro.showModal({
      title: '单次去背景授权',
      content:
        '当前照片将单次上传到已配置的去背景服务并返回透明 PNG。CBoard API 不保存原图；处理服务仍受其自身条款约束。原图会保留到您确认保存。是否继续？',
      confirmText: '同意并继续',
      cancelText: '取消'
    })
    if (!consent.confirm) return

    setBusyAction('background')
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const result =
      await taroBackgroundRemovalPort.removeBackground(draft.image)
    if (requestId !== requestIdRef.current) {
      if (result.image) {
        await taroPersonalImagePort.remove(result.image)
      }
      return
    }
    if (!result.ok || !result.image) {
      setNotice(result.message)
      setBusyAction('')
      return
    }

    const transition =
      draftImageRegistryRef.current.derive(result.image)
    setOriginalImage(transition.original)
    setDraft(current => ({ ...current, image: transition.image }))
    await removeLocalImages(transition.discard)
    setNotice(result.message)
    setBusyAction('')
  }

  const restoreOriginalBackground = async () => {
    if (!originalImage) return
    setBusyAction('restore')
    const transition = draftImageRegistryRef.current.restore()
    setOriginalImage('')
    setDraft(current => ({ ...current, image: transition.image }))
    await removeLocalImages(transition.discard)
    setNotice('已恢复原图；透明背景候选已从本机草稿中清理。')
    setBusyAction('')
  }

  const toggleSoundRecording = async () => {
    if (isRecordingSound) {
      taroTileAudioRecordingPort.stop()
      setNotice('正在结束并保存图卡录音…')
      return
    }
    if (busyAction) return

    const soundRequestId = soundRequestIdRef.current + 1
    soundRequestIdRef.current = soundRequestId
    setIsRecordingSound(true)
    setNotice('正在录制图卡声音；再次点击可提前停止，最长 30 秒。')
    const result = await taroTileAudioRecordingPort.start()
    if (soundRequestId !== soundRequestIdRef.current) {
      if (result.sound) {
        await taroTileAudioRecordingPort.remove(result.sound)
      }
      return
    }
    setIsRecordingSound(false)
    if (!result.ok || !result.sound) {
      setNotice(result.message)
      return
    }

    const transition =
      draftSoundRegistryRef.current.replace(result.sound)
    setDraft(current => ({ ...current, sound: transition.sound }))
    await removeLocalSounds(transition.discard)
    setNotice(result.message)
  }

  const playDraftSound = async () => {
    if (!draft.sound || busyAction || isRecordingSound) return
    setBusyAction('sound-play')
    try {
      await wechatTileAudioPort.play(draft.sound)
      setNotice('图卡录音试听完成。')
    } catch (error) {
      setNotice('图卡录音无法播放，请重新录制或清除后使用文字朗读。')
    } finally {
      setBusyAction('')
    }
  }

  const clearDraftSound = async () => {
    if (busyAction || isRecordingSound) return
    wechatTileAudioPort.stop()
    const transition = draftSoundRegistryRef.current.clear()
    setDraft(current => ({ ...current, sound: transition.sound }))
    await removeLocalSounds(transition.discard)
    setNotice(
      editingEntry
        ? '已标记清除图卡录音；保存修改后生效，仍会使用文字朗读。'
        : '已清除录音草稿，图卡将使用文字朗读。'
    )
  }

  const saveDraft = () => {
    if (isRecordingSound) {
      setNotice('请先停止图卡录音，再保存图卡。')
      return
    }
    if (
      !draft.image ||
      (draft.mediaType === 'video' && !draft.video) ||
      !draft.label.trim() ||
      !draft.boardId
    ) {
      setNotice('请先选择图片或短视频，并填写图卡名称和保存板块。')
      return
    }
    setBusyAction('save')
    let saved = false
    try {
      saved = editingEntry
        ? onUpdate(editingEntry.boardId, {
            id: editingEntry.tile.id,
            ...draft
          })
        : onCreate({
            id: createPrivateTileId(),
            ...draft
          })
    } catch (error) {
      saved = false
    }
    if (!saved) {
      setNotice(
        editingEntry
          ? '图卡修改保存失败，原图卡未改变，已填字段仍保留。'
          : '图卡保存失败，照片和已填字段仍保留，可稍后重试。'
      )
      setBusyAction('')
      return
    }

    const wasEditing = Boolean(editingEntry)
    const transition = draftImageRegistryRef.current.commit(
      draft.image
    )
    void removeLocalImages(transition.discard)
    const videoTransition =
      draftVideoRegistryRef.current.commit(draft.video)
    const discardVideos = editingEntry
      ? videoTransition.discard.filter(
          video =>
            !isCustomPictogramMediaReferencedElsewhere(
              boards,
              editingEntry.boardId,
              editingEntry.tile.id,
              'video',
              video
            )
        )
      : videoTransition.discard
    void removeLocalVideos(discardVideos)
    const soundTransition =
      draftSoundRegistryRef.current.commit(draft.sound)
    const discardSounds = editingEntry
      ? soundTransition.discard.filter(
          sound =>
            !isCustomPictogramMediaReferencedElsewhere(
              boards,
              editingEntry.boardId,
              editingEntry.tile.id,
              'sound',
              sound
            )
        )
      : soundTransition.discard
    void removeLocalSounds(discardSounds)
    setOriginalImage('')
    setEditingEntry(null)
    setDraft(emptyDraft(draft.boardId))
    setNotice(
      wasEditing
        ? '个人图卡修改已保存，可立即按新名称、同义词和板块使用。'
        : '个人图卡已加入所选 CBoard，可立即用于浏览、搜索、匹配和朗读。'
    )
    setBusyAction('')
  }

  const copyEntry = (entry: CustomPersonalPictogramEntry) => {
    if (!copyTargetBoard) {
      setNotice('请先选择复制目标板块。')
      return
    }
    if (copyTargetBoard.id === entry.boardId) {
      setNotice('源板和目标板相同，请选择另一个板块。')
      return
    }

    const busyKey = `copy:${entry.tile.id}`
    setBusyAction(busyKey)
    let copied = false
    try {
      copied = onCopy(entry.boardId, entry.tile.id, {
        id: createPrivateTileId(),
        targetBoardId: copyTargetBoard.id
      })
    } catch (error) {
      copied = false
    }
    setNotice(
      copied
        ? `已把“${entry.tile.label}”复制到“${copyTargetBoard.name}”；图片、短视频和录音只保留一份本机文件。`
        : `未能复制“${entry.tile.label}”；目标板可能已经有同一张个人图卡。`
    )
    setBusyAction('')
  }

  const moveEntry = (
    entry: CustomPersonalPictogramEntry,
    direction: 'earlier' | 'later'
  ) => {
    const moved = onMove(entry.boardId, entry.tile.id, direction)
    setNotice(
      moved
        ? `已将“${entry.tile.label}”${direction === 'earlier' ? '前移' : '后移'}一格，患者端将按新顺序显示。`
        : `未能移动“${entry.tile.label}”，它可能已经位于当前方向的边界。`
    )
  }

  const removeEntry = async (
    boardId: string,
    tileId: string,
    image: string,
    video: string,
    sound: string,
    label: string
  ) => {
    const confirmation = await Taro.showModal({
      title: `删除“${label}”？`,
      content:
        '将从本机 CBoard 删除这张个人图卡并尝试清理图片、短视频和录音文件；不会影响其他默认图卡。',
      confirmText: '确认删除',
      confirmColor: '#a33a2b'
    })
    if (!confirmation.confirm) return

    const imageIsShared =
      isCustomPictogramMediaReferencedElsewhere(
        boards,
        boardId,
        tileId,
        'image',
        image
      )
    const soundIsShared =
      isCustomPictogramMediaReferencedElsewhere(
        boards,
        boardId,
        tileId,
        'sound',
        sound
      )
    const videoIsShared =
      isCustomPictogramMediaReferencedElsewhere(
        boards,
        boardId,
        tileId,
        'video',
        video
      )
    setBusyAction(tileId)
    const removed = onRemove(boardId, tileId)
    if (!removed) {
      setNotice('个人图卡删除失败，请稍后重试。')
      setBusyAction('')
      return
    }
    if (
      editingEntry &&
      editingEntry.boardId === boardId &&
      editingEntry.tile.id === tileId
    ) {
      soundRequestIdRef.current += 1
      taroTileAudioRecordingPort.cancel()
      wechatTileAudioPort.stop()
      setIsRecordingSound(false)
      const soundTransition =
        draftSoundRegistryRef.current.discardAll()
      await removeLocalSounds(soundTransition.discard)
      const videoTransition =
        draftVideoRegistryRef.current.discardAll()
      await removeLocalVideos(videoTransition.discard)
      setEditingEntry(null)
      setDraft(emptyDraft((boards[0] && boards[0].id) || ''))
      setOriginalImage('')
    }
    const imageRemoved = imageIsShared
      ? true
      : await taroPersonalImagePort.remove(image)
    const soundRemoved = !sound || soundIsShared
      ? true
      : await taroTileAudioRecordingPort.remove(sound)
    const videoRemoved = !video || videoIsShared
      ? true
      : await taroPersonalVideoPort.remove(video)
    setNotice(
      imageRemoved && soundRemoved && videoRemoved
        ? imageIsShared || soundIsShared || videoIsShared
          ? `“${label}”已从当前板删除；共享媒体仍供其他板使用。`
          : `“${label}”及其本机图片、短视频和录音已删除。`
        : `“${label}”已从图板删除；部分旧媒体清理失败，但不会再用于沟通。`
    )
    setBusyAction('')
  }

  return (
    <View className='custom-pictogram-editor'>
      <View className='custom-pictogram-editor__heading'>
        <Text className='custom-pictogram-editor__eyebrow'>
          {editingEntry ? '编辑' : '新增'}
        </Text>
        <View>
          <Text className='custom-pictogram-editor__title'>
            {editingEntry ? '修改个人图卡' : '创建个人图卡'}
          </Text>
          <Text className='custom-pictogram-editor__hint'>
            {editingEntry
              ? '保存后立即更新浏览、搜索、匹配和朗读'
              : '手工确认后才写入 CBoard；视觉结果只是可编辑建议'}
          </Text>
        </View>
      </View>

      <Text className='custom-pictogram-editor__notice'>{notice}</Text>

      {!editingEntry && (
        <View className='custom-pictogram-editor__photo-actions'>
        <Button
          className='custom-pictogram-button custom-pictogram-button--primary'
          disabled={controlsBusy}
          onClick={() => choosePhoto(false)}
        >
          {busyAction === 'photo' ? '处理中…' : '只选图，手工填写'}
        </Button>
        <Button
          className='custom-pictogram-button'
          disabled={controlsBusy}
          onClick={() => choosePhoto(true)}
        >
          选图并生成建议
        </Button>
        <Button
          id='custom-pictogram-choose-video-button'
          className='custom-pictogram-button'
          disabled={controlsBusy}
          onClick={() => void chooseVideo()}
        >
          {busyAction === 'video' ? '处理中…' : '选择 10 秒短视频'}
        </Button>
        </View>
      )}

      {draft.image && (
        <View className='custom-pictogram-editor__workspace'>
          <View className='custom-pictogram-editor__media'>
            <PictogramImage
              className='custom-pictogram-editor__preview'
              src={draft.image}
              label={draft.label || '个人图卡预览'}
              mediaType={draft.mediaType}
              video={draft.video}
              videoAutoplay={draft.mediaType === 'video'}
              videoControls={draft.mediaType === 'video'}
            />
            {editingEntry ? (
              <Text className='custom-pictogram-editor__background-note'>
                编辑元数据时保留当前照片；如需换图，请删除后重新创建，避免误删正在使用的本机文件。
              </Text>
            ) : draft.mediaType === 'video' ? (
              <Text className='custom-pictogram-editor__background-note'>
                短视频已在本机循环预览；视频不上传到视觉识别或去背景服务，请手工确认名称和朗读文字。
              </Text>
            ) : (
              <View className='custom-pictogram-editor__background-removal'>
                <Button
                  className='custom-pictogram-button custom-pictogram-button--background'
                  disabled={controlsBusy || Boolean(originalImage)}
                  onClick={removeBackground}
                >
                  {busyAction === 'background'
                    ? '正在去除背景…'
                    : originalImage
                      ? '已应用透明背景'
                      : '一键去除杂乱背景'}
                </Button>
                {originalImage && (
                  <Button
                    className='custom-pictogram-button'
                    disabled={controlsBusy}
                    onClick={restoreOriginalBackground}
                  >
                    {busyAction === 'restore'
                      ? '正在恢复…'
                      : '恢复原图'}
                  </Button>
                )}
                <Text className='custom-pictogram-editor__background-note'>
                  仅在您确认后单次上传；失败不会覆盖原图，结果保存前可恢复。
                </Text>
              </View>
            )}
          </View>
          <View className='custom-pictogram-editor__fields'>
            <Input
              className='custom-pictogram-input'
              maxlength={40}
              placeholder='图卡名称（必填）'
              value={draft.label}
              disabled={controlsBusy}
              onInput={event =>
                updateField('label', event.detail.value)
              }
            />
            <Input
              className='custom-pictogram-input'
              maxlength={60}
              placeholder='朗读文字；留空时使用图卡名称'
              value={draft.vocalization}
              disabled={controlsBusy}
              onInput={event =>
                updateField('vocalization', event.detail.value)
              }
            />
            <View className='custom-pictogram-editor__sound'>
              <Text className='custom-pictogram-editor__sound-label'>
                个性化图卡声音
              </Text>
              <View className='custom-pictogram-editor__sound-actions'>
                <Button
                  id='custom-pictogram-record-sound-button'
                  className='custom-pictogram-button custom-pictogram-button--record'
                  disabled={Boolean(busyAction)}
                  onClick={() => void toggleSoundRecording()}
                >
                  {isRecordingSound ? '停止录音' : '录制声音'}
                </Button>
                {draft.sound && !isRecordingSound && (
                  <>
                    <Button
                      id='custom-pictogram-play-sound-button'
                      className='custom-pictogram-button'
                      disabled={Boolean(busyAction)}
                      onClick={() => void playDraftSound()}
                    >
                      {busyAction === 'sound-play'
                        ? '正在试听…'
                        : '试听'}
                    </Button>
                    <Button
                      id='custom-pictogram-clear-sound-button'
                      className='custom-pictogram-button'
                      disabled={Boolean(busyAction)}
                      onClick={() => void clearDraftSound()}
                    >
                      清除录音
                    </Button>
                  </>
                )}
              </View>
              <Text className='custom-pictogram-editor__background-note'>
                录音只保存在当前设备，随主动导出的完整备份迁移；没有录音时使用上方朗读文字。
              </Text>
            </View>
            <Input
              className='custom-pictogram-input'
              maxlength={160}
              placeholder='同义词，用逗号分隔'
              value={draft.synonyms}
              disabled={controlsBusy}
              onInput={event =>
                updateField('synonyms', event.detail.value)
              }
            />
            <Input
              className='custom-pictogram-input'
              maxlength={40}
              placeholder='语义分类，例如：饮食、家人'
              value={draft.category}
              disabled={controlsBusy}
              onInput={event =>
                updateField('category', event.detail.value)
              }
            />
            <Input
              className='custom-pictogram-input'
              maxlength={80}
              placeholder='拍摄者或图片提供者（可选）'
              value={draft.author}
              disabled={controlsBusy}
              onInput={event =>
                updateField('author', event.detail.value)
              }
            />
            <Input
              className='custom-pictogram-input'
              maxlength={160}
              placeholder='本机使用说明'
              value={draft.license}
              disabled={controlsBusy}
              onInput={event =>
                updateField('license', event.detail.value)
              }
            />
            <Picker
              mode='selector'
              range={boardNames}
              value={boardIndex}
              disabled={controlsBusy}
              onChange={event => {
                const index = Number(event.detail.value)
                const board = boards[index]
                if (board) updateField('boardId', board.id)
              }}
            >
              <View className='custom-pictogram-picker'>
                {editingEntry ? '移动到板块：' : '保存到板块：'}
                {boards[boardIndex]
                  ? boards[boardIndex].name
                  : '请选择'}
              </View>
            </Picker>
            <Button
              className='custom-pictogram-button custom-pictogram-button--save'
              disabled={controlsBusy}
              onClick={saveDraft}
            >
              {busyAction === 'save'
                ? '正在保存…'
                : editingEntry
                  ? '保存修改'
                  : '确认并加入 CBoard'}
            </Button>
            {editingEntry && (
              <Button
                className='custom-pictogram-button'
                disabled={controlsBusy}
                onClick={cancelEditing}
              >
                取消修改
              </Button>
            )}
          </View>
        </View>
      )}

      {customEntries.length > 0 && (
        <View className='custom-pictogram-editor__saved'>
          <Text className='custom-pictogram-editor__saved-title'>
            已新增个人图卡（{customEntries.length}）
          </Text>
          <Picker
            mode='selector'
            range={boardNames}
            value={copyTargetBoardIndex}
            disabled={controlsBusy}
            onChange={event => {
              const target = boards[Number(event.detail.value)]
              if (target) setCopyTargetBoardId(target.id)
            }}
          >
            <View
              id='custom-pictogram-copy-target-board-picker'
              className='custom-pictogram-picker custom-pictogram-editor__copy-target'
            >
              复制目标板块：
              {copyTargetBoard ? copyTargetBoard.name : '请选择'}
            </View>
          </Picker>
          <Text className='custom-pictogram-editor__copy-hint'>
            复制会沿用 CBoard 的“新 Tile、同一媒体”语义；两块板都可使用，删除其中一份不会误删另一份的图片、短视频或录音。
          </Text>
          <View className='custom-pictogram-editor__saved-list'>
            {customEntries.map(entry => {
              const board = boards.find(
                item => item.id === entry.boardId
              )
              const tileIndex = board
                ? board.layout.tileIds.indexOf(entry.tile.id)
                : -1
              const canMoveEarlier = tileIndex > 0
              const canMoveLater = Boolean(
                board &&
                  tileIndex >= 0 &&
                  tileIndex < board.layout.tileIds.length - 1
              )

              return (
              <View
                className='custom-pictogram-card'
                key={`${entry.boardId}:${entry.tile.id}`}
              >
                <PictogramImage
                  className='custom-pictogram-card__image'
                  src={entry.tile.image}
                  label={entry.tile.label}
                  mediaType={entry.tile.mediaType}
                  video={entry.tile.video}
                />
                <View className='custom-pictogram-card__copy'>
                  <Text className='custom-pictogram-card__label'>
                    {entry.tile.label}
                  </Text>
                  <Text className='custom-pictogram-card__board'>
                    {entry.boardName} · 仅本机
                    {entry.tile.mediaType === 'video' ? ' · 短视频' : ''}
                    {entry.tile.sound ? ' · 已录音' : ''}
                  </Text>
                </View>
                <View className='custom-pictogram-card__actions'>
                  <Button
                    id={`custom-pictogram-move-earlier-${entry.tile.id}`}
                    className='custom-pictogram-button'
                    disabled={controlsBusy || !canMoveEarlier}
                    onClick={() => moveEntry(entry, 'earlier')}
                  >
                    前移
                  </Button>
                  <Button
                    id={`custom-pictogram-move-later-${entry.tile.id}`}
                    className='custom-pictogram-button'
                    disabled={controlsBusy || !canMoveLater}
                    onClick={() => moveEntry(entry, 'later')}
                  >
                    后移
                  </Button>
                  <Button
                    className='custom-pictogram-button'
                    disabled={controlsBusy}
                    onClick={() => void startEditing(entry)}
                  >
                    编辑
                  </Button>
                  <Button
                    id={`custom-pictogram-copy-${entry.tile.id}`}
                    className='custom-pictogram-button'
                    disabled={
                      controlsBusy ||
                      !copyTargetBoard ||
                      copyTargetBoard.id === entry.boardId
                    }
                    onClick={() => copyEntry(entry)}
                  >
                    {busyAction === `copy:${entry.tile.id}`
                      ? '复制中…'
                      : copyTargetBoard &&
                          copyTargetBoard.id === entry.boardId
                        ? '已在目标板'
                        : '复制到目标板'}
                  </Button>
                  <Button
                    id={`custom-pictogram-delete-${entry.tile.id}`}
                    className='custom-pictogram-button custom-pictogram-button--danger'
                    disabled={controlsBusy}
                    onClick={() =>
                      removeEntry(
                        entry.boardId,
                        entry.tile.id,
                        entry.tile.image,
                        entry.tile.video || '',
                        entry.tile.sound || '',
                        entry.tile.label
                      )
                    }
                  >
                    {busyAction === entry.tile.id ? '删除中…' : '删除'}
                  </Button>
                </View>
              </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}
