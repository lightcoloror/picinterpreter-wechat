import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Input,
  Picker,
  Text,
  View
} from '@tarojs/components'
import { isPersonalCommunicationBoard } from '@cboard-communication-core/boardManagement'
import type {
  BoardDTO,
  TileDTO
} from '@cboard-communication-core/dto'
import {
  normalizeExpressionPictogramSearchQuery,
  searchExpressionPictograms
} from '@cboard-communication-core/expressionPictogramSearch'
import type { PersonalImagePreference } from '@cboard-communication-core/personalImagePreferences'
import {
  DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE,
  createDevicePrivatePictogramAttribution,
  normalizePublicPictogramAttribution,
  type PictogramAttribution
} from '@cboard-communication-core/pictogramAttribution'
import {
  CURATED_PUBLIC_PICTOGRAM_ID_PREFIX,
  listCuratedPublicPictograms
} from '@cboard-communication-core/publicPictogramCuration'
import {
  buildCommunicationTileCatalog,
  type CommunicationCatalogItem
} from '@cboard-communication-core/symbolMatching'

import { taroPersonalImagePort } from '../../platform/taroPersonalImagePort'
import PictogramImage from '../../components/PictogramImage'
import './PersonalImageManager.css'

interface PersonalImageManagerProps {
  boards: BoardDTO[]
  preferences: PersonalImagePreference[]
  onSave: (entry: {
    tileId: string
    boardId: string
    labelSnapshot: string
    image: string
    pictogramAttribution: PictogramAttribution
  }) => boolean
  onRemove: (tileId: string, boardId: string) => boolean
  onCuratePublic: (entry: {
    sourceTile: TileDTO
    targetBoardId: string
  }) => boolean
  onRemoveCuratedPublic: (
    boardId: string,
    tileId: string
  ) => boolean
  onOpenBoardManager: () => void
}

function candidateLabel(candidate: CommunicationCatalogItem) {
  return candidate.displayLabel || candidate.tile.label
}

function preferenceKey(tileId: string, boardId: string) {
  return `${boardId}:${tileId}`
}

export default function PersonalImageManager({
  boards,
  preferences,
  onSave,
  onRemove,
  onCuratePublic,
  onRemoveCuratedPublic,
  onOpenBoardManager
}: PersonalImageManagerProps) {
  const [query, setQuery] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [attributionAuthor, setAttributionAuthor] = useState('')
  const [attributionLicense, setAttributionLicense] = useState<string>(
    DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE
  )
  const [targetBoardId, setTargetBoardId] = useState('')
  const [notice, setNotice] = useState(
    '照片只保存在当前微信设备，不会进入账号同步或公开图板。'
  )
  const catalog = useMemo(
    () => buildCommunicationTileCatalog(boards),
    [boards]
  )
  const searchableCatalog = useMemo(
    () =>
      catalog.filter(
        candidate =>
          !candidate.tile.id.startsWith(
            CURATED_PUBLIC_PICTOGRAM_ID_PREFIX
          )
      ),
    [catalog]
  )
  const personalBoards = useMemo(
    () => boards.filter(isPersonalCommunicationBoard),
    [boards]
  )
  const curatedEntries = useMemo(
    () => listCuratedPublicPictograms(boards),
    [boards]
  )
  const targetBoardIndex = Math.max(
    0,
    personalBoards.findIndex(board => board.id === targetBoardId)
  )
  const targetBoard = personalBoards[targetBoardIndex]
  const candidateByKey = useMemo(
    () =>
      new Map(
        catalog.map(candidate => [
          preferenceKey(candidate.tile.id, candidate.boardId),
          candidate
        ])
      ),
    [catalog]
  )
  const preferenceByKey = useMemo(
    () =>
      new Map(
        preferences.map(preference => [
          preferenceKey(preference.tileId, preference.boardId),
          preference
        ])
      ),
    [preferences]
  )
  const configured = preferences
    .map(preference => ({
      preference,
      candidate: candidateByKey.get(
        preferenceKey(preference.tileId, preference.boardId)
      )
    }))
    .filter(
      (
        item
      ): item is {
        preference: PersonalImagePreference
        candidate: CommunicationCatalogItem
      } => Boolean(item.candidate)
    )
  const normalizedQuery = normalizeExpressionPictogramSearchQuery(query)
  const candidates = useMemo(() => {
    if (!normalizedQuery) return searchableCatalog.slice(0, 30)

    const ranked = searchExpressionPictograms(boards, normalizedQuery, {
      limit: 30
    }).matches.flatMap(match => {
      const candidate = candidateByKey.get(
        preferenceKey(match.tile.id, match.boardId)
      )
      return candidate ? [candidate] : []
    })
    const rankedKeys = new Set(
      ranked.map(candidate =>
        preferenceKey(candidate.tile.id, candidate.boardId)
      )
    )
    const boardMatches = searchableCatalog.filter(candidate => {
      const key = preferenceKey(candidate.tile.id, candidate.boardId)
      return (
        !rankedKeys.has(key) &&
        normalizeExpressionPictogramSearchQuery(
          candidate.boardName
        ).includes(normalizedQuery)
      )
    })

    return [...ranked, ...boardMatches].slice(0, 30)
  }, [
    boards,
    candidateByKey,
    normalizedQuery,
    searchableCatalog
  ])
  const selectedCandidate = candidateByKey.get(selectedKey)
  const selectedPreference = preferenceByKey.get(selectedKey)

  useEffect(() => {
    if (!personalBoards.length) {
      if (targetBoardId) setTargetBoardId('')
      return
    }
    if (!personalBoards.some(board => board.id === targetBoardId)) {
      setTargetBoardId(personalBoards[0].id)
    }
  }, [personalBoards, targetBoardId])

  const editAttribution = (
    candidate: CommunicationCatalogItem,
    preference: PersonalImagePreference
  ) => {
    const attribution = preference.pictogramAttribution
    setSelectedKey(
      preferenceKey(candidate.tile.id, candidate.boardId)
    )
    setAttributionAuthor(
      (attribution && attribution.author) || ''
    )
    setAttributionLicense(
      (attribution && attribution.license) ||
        DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE
    )
  }

  const saveAttribution = () => {
    if (!selectedCandidate || !selectedPreference) return

    const saved = onSave({
      tileId: selectedCandidate.tile.id,
      boardId: selectedCandidate.boardId,
      labelSnapshot: candidateLabel(selectedCandidate),
      image: selectedPreference.image,
      pictogramAttribution:
        createDevicePrivatePictogramAttribution({
          boardId: selectedCandidate.boardId,
          tileId: selectedCandidate.tile.id,
          label: candidateLabel(selectedCandidate),
          author: attributionAuthor,
          license: attributionLicense
        })
    })
    setNotice(
      saved
        ? `已保存「${candidateLabel(selectedCandidate)}」的本机图片说明。`
        : '图片说明保存失败，请稍后重试。'
    )
  }

  const chooseImage = async (candidate: CommunicationCatalogItem) => {
    const key = preferenceKey(candidate.tile.id, candidate.boardId)
    const previous = preferenceByKey.get(key)
    setBusyKey(key)
    const result = await taroPersonalImagePort.selectAndSave()

    if (!result.ok || !result.image) {
      setNotice(result.message)
      setBusyKey('')
      return
    }

    const saved = onSave({
      tileId: candidate.tile.id,
      boardId: candidate.boardId,
      labelSnapshot: candidateLabel(candidate),
      image: result.image,
      pictogramAttribution:
        (previous && previous.pictogramAttribution) ||
        createDevicePrivatePictogramAttribution({
          boardId: candidate.boardId,
          tileId: candidate.tile.id,
          label: candidateLabel(candidate)
        })
    })
    if (!saved) {
      await taroPersonalImagePort.remove(result.image)
      setNotice('图片已选择，但本机偏好保存失败，请稍后重试。')
      setBusyKey('')
      return
    }

    if (previous && previous.image !== result.image) {
      await taroPersonalImagePort.remove(previous.image)
    }
    setNotice(`已为「${candidateLabel(candidate)}」启用当前设备的熟悉图片。`)
    setBusyKey('')
  }

  const restoreDefault = async (
    preference: PersonalImagePreference,
    candidate: CommunicationCatalogItem
  ) => {
    const key = preferenceKey(preference.tileId, preference.boardId)
    setBusyKey(key)
    const removed = onRemove(preference.tileId, preference.boardId)
    if (!removed) {
      setNotice('恢复默认图片失败，请稍后重试。')
      setBusyKey('')
      return
    }

    await taroPersonalImagePort.remove(preference.image)
    setNotice(`「${candidateLabel(candidate)}」已恢复 CBoard 默认图片。`)
    setBusyKey('')
  }

  const curatePublicPictogram = (
    candidate: CommunicationCatalogItem
  ) => {
    if (!targetBoard) {
      setNotice('请先新建个人板块，再收纳公开图卡。')
      return
    }
    const saved = onCuratePublic({
      sourceTile: candidate.tile,
      targetBoardId: targetBoard.id
    })
    setNotice(
      saved
        ? `已把「${candidateLabel(candidate)}」加入“${targetBoard.name}”。`
        : `未能加入「${candidateLabel(candidate)}」；可能已收纳，或来源许可信息不完整。`
    )
  }

  const removeCuratedPictogram = (
    boardId: string,
    tileId: string,
    label: string
  ) => {
    const removed = onRemoveCuratedPublic(boardId, tileId)
    setNotice(
      removed
        ? `已从个人板移除「${label}」，原公共图库不受影响。`
        : `未能移除「${label}」，请稍后重试。`
    )
  }

  const renderCandidate = (
    candidate: CommunicationCatalogItem,
    mode: 'configured' | 'catalog',
    preference?: PersonalImagePreference
  ) => {
    const key = preferenceKey(candidate.tile.id, candidate.boardId)
    const activePreference = preference || preferenceByKey.get(key)
    const image = activePreference
      ? activePreference.image
      : candidate.tile.image
    const busy = busyKey === key
    const publicAttribution =
      normalizePublicPictogramAttribution(
        candidate.tile.pictogramAttribution
      )
    const canCurate =
      mode === 'catalog' &&
      !candidate.tile.loadBoardId &&
      Boolean(candidate.tile.image) &&
      Boolean(publicAttribution)

    return (
      <View
        className={`personal-image-card ${
          activePreference ? 'personal-image-card--active' : ''
        }`}
        key={`${mode}-${key}`}
      >
        <PictogramImage
          className='personal-image-card__image'
          src={image}
          label={candidateLabel(candidate)}
        />
        <View className='personal-image-card__copy'>
          <Text className='personal-image-card__label'>
            {candidateLabel(candidate)}
          </Text>
          <Text className='personal-image-card__board'>
            {candidate.boardName}
          </Text>
          {activePreference && (
            <>
              <Text className='personal-image-card__private'>仅本机私图</Text>
              <Text className='personal-image-card__license'>
                {(activePreference.pictogramAttribution &&
                  activePreference.pictogramAttribution.license) ||
                  DEFAULT_DEVICE_PRIVATE_PICTOGRAM_LICENSE}
              </Text>
            </>
          )}
        </View>
        <View className='personal-image-card__actions'>
          <Button
            className='personal-image-action personal-image-action--primary'
            disabled={busy}
            onClick={() => chooseImage(candidate)}
          >
            {busy ? '处理中…' : activePreference ? '更换照片' : '选择照片'}
          </Button>
          {activePreference && (
            <Button
              className='personal-image-action'
              disabled={busy}
              onClick={() =>
                editAttribution(candidate, activePreference)
              }
            >
              编辑说明
            </Button>
          )}
          {activePreference && (
            <Button
              className='personal-image-action personal-image-action--restore'
              disabled={busy}
              onClick={() => restoreDefault(activePreference, candidate)}
            >
              恢复默认
            </Button>
          )}
          {canCurate && (
            <Button
              className='personal-image-action personal-image-action--curate'
              disabled={!targetBoard}
              onClick={() => curatePublicPictogram(candidate)}
            >
              {targetBoard
                ? `加入“${targetBoard.name}”`
                : '先新建个人板'}
            </Button>
          )}
        </View>
      </View>
    )
  }

  return (
    <View className='personal-image-manager'>
      <View className='section-heading'>
        <Text className='section-heading__index'>图</Text>
        <View>
          <Text className='section-heading__title'>个人熟悉图片</Text>
          <Text className='section-heading__hint'>
            照护者为当前患者选择熟悉照片，沟通时优先显示
          </Text>
        </View>
      </View>

      <Text className='personal-image-manager__privacy'>{notice}</Text>

      {selectedCandidate && selectedPreference && (
        <View className='personal-image-attribution-editor'>
          <Text className='personal-image-attribution-editor__title'>
            「{candidateLabel(selectedCandidate)}」图片说明
          </Text>
          <Text className='personal-image-attribution-editor__hint'>
            仅作为当前设备的来源备注，不代表平台核验了公开授权。
          </Text>
          <Input
            className='personal-image-attribution-editor__input'
            maxlength={80}
            placeholder='拍摄者或图片提供者（可选）'
            value={attributionAuthor}
            onInput={event =>
              setAttributionAuthor(event.detail.value)
            }
          />
          <Input
            className='personal-image-attribution-editor__input'
            maxlength={160}
            placeholder='使用说明'
            value={attributionLicense}
            onInput={event =>
              setAttributionLicense(event.detail.value)
            }
          />
          <View className='personal-image-attribution-editor__actions'>
            <Button
              className='personal-image-action personal-image-action--primary'
              onClick={saveAttribution}
            >
              保存图片说明
            </Button>
            <Button
              className='personal-image-action'
              onClick={() => setSelectedKey('')}
            >
              收起
            </Button>
          </View>
        </View>
      )}

      {configured.length > 0 && (
        <View className='personal-image-section'>
          <Text className='personal-image-section__title'>
            已启用（{configured.length}）
          </Text>
          <View className='personal-image-list'>
            {configured.map(({ preference, candidate }) =>
              renderCandidate(candidate, 'configured', preference)
            )}
          </View>
        </View>
      )}

      <View className='personal-image-section personal-image-curation'>
        <Text className='personal-image-section__title'>
          公开图卡收纳
        </Text>
        <Text className='personal-image-section__hint'>
          只把带公开来源说明的内容图卡复制到本机个人板；不会复制导航卡、家庭私图或图卡录音。
        </Text>
        {personalBoards.length ? (
          <Picker
            mode='selector'
            range={personalBoards.map(board => board.name)}
            value={targetBoardIndex}
            onChange={event => {
              const board =
                personalBoards[Number(event.detail.value)]
              if (board) setTargetBoardId(board.id)
            }}
          >
            <View
              id='public-pictogram-target-board-picker'
              className='personal-image-curation__picker'
            >
              收纳到：{targetBoard ? targetBoard.name : '请选择个人板'}
            </View>
          </Picker>
        ) : (
          <View className='personal-image-curation__empty'>
            <Text>还没有个人板块。请先新建，避免修改 CBoard 内置板。</Text>
          </View>
        )}
        <Button
          id='open-board-manager-for-curation-button'
          className='personal-image-action personal-image-action--primary'
          onClick={onOpenBoardManager}
        >
          打开板块管理
        </Button>

        {curatedEntries.length > 0 && (
          <View className='personal-image-curation__saved'>
            <Text className='personal-image-section__hint'>
              已收纳（{curatedEntries.length}）
            </Text>
            <View className='personal-image-list'>
              {curatedEntries.map(entry => (
                <View
                  className='personal-image-card personal-image-card--curated'
                  key={`${entry.boardId}:${entry.tile.id}`}
                >
                  <PictogramImage
                    className='personal-image-card__image'
                    src={entry.tile.image}
                    label={entry.tile.label}
                    mediaType={entry.tile.mediaType}
                    video={entry.tile.video}
                  />
                  <View className='personal-image-card__copy'>
                    <Text className='personal-image-card__label'>
                      {entry.tile.label}
                    </Text>
                    <Text className='personal-image-card__board'>
                      {entry.boardName}
                    </Text>
                    <Text className='personal-image-card__license'>
                      {entry.tile.pictogramAttribution?.name} ·{' '}
                      {entry.tile.pictogramAttribution?.license}
                    </Text>
                  </View>
                  <View className='personal-image-card__actions'>
                    <Button
                      className='personal-image-action personal-image-action--danger'
                      onClick={() =>
                        removeCuratedPictogram(
                          entry.boardId,
                          entry.tile.id,
                          entry.tile.label
                        )
                      }
                    >
                      从个人板移除
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <View className='personal-image-section'>
        <Text className='personal-image-section__title'>
          跨分类找图并收纳
        </Text>
        <Input
          id='personal-image-library-search'
          className='personal-image-search'
          value={query}
          confirmType='search'
          placeholder='输入标签、同义词或板块，例如：汤匙、厕所'
          onInput={event => setQuery(event.detail.value)}
        />
        <Text className='personal-image-section__hint'>
          仅供家属维护图片库。当前显示前 {candidates.length} 个结果；可更换熟悉照片，也可把有公开来源说明的图卡加入上方个人板。
        </Text>
        <View className='personal-image-list'>
          {candidates.length ? (
            candidates.map(candidate =>
              renderCandidate(candidate, 'catalog')
            )
          ) : (
            <Text className='personal-image-empty'>没有找到对应 CBoard 图卡。</Text>
          )}
        </View>
      </View>
    </View>
  )
}
