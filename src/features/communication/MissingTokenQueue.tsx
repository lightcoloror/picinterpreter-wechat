import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import type { BoardDTO } from '@cboard-communication-core/dto'
import {
  countCatalogAutoResolvedMissingTokens,
  countPendingMissingTokens,
  findSafeLocalMissingTokenResolutions,
  getMissingTokenSuggestions
} from '@cboard-communication-core/missingTokens'
import type { MissingTokenRecord } from '@cboard-communication-core/repository'
import {
  DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
  buildAiGeneratedRuntimePictogram,
  buildDevicePrivateRuntimePictogram
} from '@cboard-communication-core/runtimePictogram'
import {
  buildCommunicationTileCatalog,
  type CommunicationCatalogItem
} from '@cboard-communication-core/symbolMatching'

import type { RuntimePictogram } from '../../platform/pictogramSearchPort'
import { taroCommunicationAiPort } from '../../platform/taroCommunicationAiPort'
import { saveBase64PngToUserData } from '../../platform/taroBase64ImageFile'
import { taroPersonalImagePort } from '../../platform/taroPersonalImagePort'
import PictogramImage from '../../components/PictogramImage'

export interface MissingTokenReview {
  status: 'new' | 'suggested' | 'ignored' | 'resolved'
  resolvedPictogramId?: string
  resolvedPictogram?: RuntimePictogram
  suggestedPictogramId?: string
  suggestedPictogram?: RuntimePictogram
  suggestedPictograms?: RuntimePictogram[]
  source?: string
  reviewedByCaregiver?: boolean
}

export interface MissingTokenOnlineResult {
  ok: boolean
  message: string
}

interface MissingTokenQueueProps {
  boards: BoardDTO[]
  records: MissingTokenRecord[]
  onlineSearchEnabled: boolean
  onlineSearchAvailable: boolean
  onReview: (recordId: string, review: MissingTokenReview) => boolean
  onSearchOnline: (recordIds: string[]) => Promise<MissingTokenOnlineResult>
  onAcceptOnline: (
    recordId: string,
    pictogramId?: string
  ) => Promise<MissingTokenOnlineResult>
}

interface GeneratedPictogramCandidate {
  recordId: string
  token: string
  pictogram: RuntimePictogram
  provider: string
  model: string
}

const STATUS_LABELS: Record<MissingTokenRecord['status'], string> = {
  new: '待处理',
  suggested: '有建议',
  resolved: '已解决',
  ignored: '已忽略'
}

function getCandidateLabel(candidate: CommunicationCatalogItem) {
  return candidate.displayLabel || candidate.tile.label || candidate.tile.vocalization
}

function getStatusRank(record: MissingTokenRecord) {
  if (record.status === 'new' || record.status === 'suggested') {
    return 0
  }
  return record.status === 'resolved' ? 1 : 2
}

function isDevicePrivateResolution(record: MissingTokenRecord) {
  return (
    record.source === DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER ||
    (
      record.resolvedPictogram &&
      record.resolvedPictogram.source.provider ===
        DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER
    )
  )
}

function getManagedResolutionImage(record: MissingTokenRecord) {
  const resolvedPictogram = record.resolvedPictogram
  if (!resolvedPictogram) return ''

  const isOnlineResolution = String(record.source || '').startsWith('online:')
  return isDevicePrivateResolution(record) || isOnlineResolution
    ? resolvedPictogram.image
    : ''
}

export default function MissingTokenQueue({
  boards,
  records,
  onlineSearchEnabled,
  onlineSearchAvailable,
  onReview,
  onSearchOnline,
  onAcceptOnline
}: MissingTokenQueueProps) {
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [recentLocalResolvedCount, setRecentLocalResolvedCount] = useState(0)
  const [busyRecordIds, setBusyRecordIds] = useState<string[]>([])
  const [generatedCandidate, setGeneratedCandidate] =
    useState<GeneratedPictogramCandidate | null>(null)
  const catalog = useMemo(() => buildCommunicationTileCatalog(boards), [boards])
  const visibleRecords = useMemo(
    () =>
      records
        .slice()
        .sort((left, right) => {
          const rankDifference = getStatusRank(left) - getStatusRank(right)
          return rankDifference || right.updatedAt - left.updatedAt
        })
        .slice(0, 20),
    [records]
  )
  const localResolutions = useMemo(
    () => findSafeLocalMissingTokenResolutions(records, catalog),
    [catalog, records]
  )
  const localResolutionRecordIds = useMemo(
    () => new Set(localResolutions.map(item => item.recordId)),
    [localResolutions]
  )
  const persistedLocalResolvedCount = useMemo(
    () => countCatalogAutoResolvedMissingTokens(records),
    [records]
  )
  const localResolvedCount = Math.max(
    recentLocalResolvedCount,
    persistedLocalResolvedCount
  )
  const activeRecord = visibleRecords.find(record => record.id === activeRecordId)
  const pendingCount = countPendingMissingTokens(
    records,
    localResolutionRecordIds
  )
  const onlineSearchReady = onlineSearchEnabled && onlineSearchAvailable
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return catalog
      .filter(candidate => {
        if (!normalizedQuery) {
          return true
        }

        return [
          getCandidateLabel(candidate),
          ...candidate.labels,
          ...candidate.synonyms
        ].some(term =>
          String(term || '')
            .toLocaleLowerCase()
            .includes(normalizedQuery)
        )
      })
      .slice(0, 24)
  }, [catalog, query])

  useEffect(() => {
    if (!localResolutions.length) return

    let resolvedCount = 0
    localResolutions.forEach(resolution => {
      try {
        if (
          onReview(resolution.recordId, {
            status: 'resolved',
            resolvedPictogramId: resolution.resolvedPictogramId,
            source: resolution.source,
            reviewedByCaregiver: false
          })
        ) {
          resolvedCount += 1
        }
      } catch (error) {
        // A storage failure keeps the record pending for a later retry.
      }
    })

    if (resolvedCount) {
      setRecentLocalResolvedCount(current => Math.max(current, resolvedCount))
    }
  }, [localResolutions, onReview])

  const applyReview = (recordId: string, review: MissingTokenReview) => {
    let saved = false
    try {
      saved = onReview(recordId, review)
    } catch (error) {
      saved = false
    }

    setNotice(saved ? '维护结果已保存，下次生成会使用新规则。' : '保存失败，请稍后重试。')
    if (saved) {
      setActiveRecordId(null)
      setQuery('')
    }
    return saved
  }

  const resolveWithPrivateImage = async (record: MissingTokenRecord) => {
    setBusyRecordIds(current =>
      Array.from(new Set([...current, record.id]))
    )
    try {
      const selected = await taroPersonalImagePort.selectAndSave()
      if (!selected.ok || !selected.image) {
        setNotice(selected.message)
        return
      }

      const pictogram = buildDevicePrivateRuntimePictogram({
        recordId: record.id,
        label: record.normalizedToken,
        image: selected.image
      })
      const saved = Boolean(
        pictogram &&
        applyReview(record.id, {
          status: 'resolved',
          resolvedPictogramId: pictogram.id,
          resolvedPictogram: pictogram,
          source: DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
          reviewedByCaregiver: true
        })
      )
      if (!saved) {
        await taroPersonalImagePort.remove(selected.image)
        setNotice('图片已选择，但本机词图关联保存失败，请稍后重试。')
        return
      }

      setNotice(
        `已为「${record.normalizedToken}」保存本机私有图片，下次生成会直接使用。`
      )
    } finally {
      setBusyRecordIds(current =>
        current.filter(recordId => recordId !== record.id)
      )
    }
  }

  const restorePendingRecord = async (record: MissingTokenRecord) => {
    const privateResolution = isDevicePrivateResolution(record)
    const managedImage = getManagedResolutionImage(record)
    const saved = applyReview(record.id, { status: 'new' })
    if (!saved || !managedImage) return

    const removed = await taroPersonalImagePort.remove(managedImage)
    if (privateResolution) {
      setNotice(
        removed
          ? '本机私图关联和图片文件已移除，可重新选择处理方式。'
          : '本机私图关联已移除；旧图片文件清理失败，但不会再用于沟通。'
      )
      return
    }

    setNotice(
      removed
        ? '在线图片缓存和关联已移除，可重新选择处理方式。'
        : '在线图片关联已移除；旧缓存文件清理失败，但不会再用于沟通。'
    )
  }

  const searchOnline = async (recordIds: string[]) => {
    setBusyRecordIds(current => Array.from(new Set([...current, ...recordIds])))
    try {
      const result = await onSearchOnline(recordIds)
      setNotice(result.message)
    } catch (error) {
      setNotice('在线搜索失败，请检查网络后重试。')
    } finally {
      setBusyRecordIds(current =>
        current.filter(recordId => !recordIds.includes(recordId))
      )
    }
  }

  const acceptOnline = async (recordId: string, pictogramId?: string) => {
    setBusyRecordIds(current => Array.from(new Set([...current, recordId])))
    try {
      const result = await onAcceptOnline(recordId, pictogramId)
      setNotice(result.message)
    } catch (error) {
      setNotice('图片保存失败，请保留候选并稍后重试。')
    } finally {
      setBusyRecordIds(current => current.filter(id => id !== recordId))
    }
  }

  const generateAiPictogram = async (record: MissingTokenRecord) => {
    setBusyRecordIds(current =>
      Array.from(new Set([...current, record.id]))
    )
    let generatedImage = ''
    try {
      const result = await taroCommunicationAiPort.generatePictogram({
        label: record.normalizedToken
      })
      if (!result.ok || !result.value) {
        setNotice(result.message)
        return
      }

      generatedImage = await saveBase64PngToUserData(
        result.value.imageBase64,
        'picinterpreter-ai-pictogram'
      )
      const pictogram = buildAiGeneratedRuntimePictogram({
        recordId: record.id,
        generationId: result.value.generationId,
        label: record.normalizedToken,
        image: generatedImage,
        provider: result.value.provider,
        model: result.value.model
      })
      if (!pictogram) {
        throw new Error('Invalid AI-generated pictogram')
      }

      setGeneratedCandidate({
        recordId: record.id,
        token: record.normalizedToken,
        pictogram,
        provider: result.value.provider,
        model: result.value.model
      })
      setNotice('AI 图符已生成，请由照护者核对含义后再保存。')
    } catch (error) {
      if (generatedImage) {
        await taroPersonalImagePort.remove(generatedImage)
      }
      setNotice('AI 图符生成或本机保存失败，请使用现有图卡或本机图片。')
    } finally {
      setBusyRecordIds(current =>
        current.filter(recordId => recordId !== record.id)
      )
    }
  }

  const discardGeneratedCandidate = async () => {
    if (!generatedCandidate) return
    const candidate = generatedCandidate
    setGeneratedCandidate(null)
    const removed = await taroPersonalImagePort.remove(
      candidate.pictogram.image
    )
    setNotice(
      removed
        ? '已放弃 AI 图符，临时图片已删除。'
        : '已放弃 AI 图符；临时图片清理失败，但不会用于沟通。'
    )
  }

  const confirmGeneratedCandidate = async () => {
    if (!generatedCandidate) return
    const candidate = generatedCandidate
    const saved = applyReview(candidate.recordId, {
      status: 'resolved',
      resolvedPictogramId: candidate.pictogram.id,
      resolvedPictogram: candidate.pictogram,
      source: DEVICE_PRIVATE_RUNTIME_PICTOGRAM_PROVIDER,
      reviewedByCaregiver: true
    })
    if (saved) {
      setGeneratedCandidate(null)
      setNotice(
        `已为「${candidate.token}」保存 AI 图符，下次生成会直接使用。`
      )
      return
    }

    setGeneratedCandidate(null)
    await taroPersonalImagePort.remove(candidate.pictogram.image)
    setNotice('AI 图符关联保存失败，临时图片已放弃，请稍后重试。')
  }

  return (
    <View className='panel missing-queue-panel'>
      <View className='missing-queue__heading'>
        <View>
          <Text className='missing-queue__title'>缺图维护</Text>
          <Text className='missing-queue__hint'>先查本机 CBoard；缺词自动联网搜索，采用前必须人工确认</Text>
        </View>
        <Text className='missing-queue__count'>待处理 {pendingCount}</Text>
      </View>

      {!onlineSearchEnabled && (
        <Text
          id='missing-token-online-status'
          className='missing-queue__offline'
        >
          缺词自动联网已关闭，可在“照护设置”中开启；现有图板和离线沟通不受影响。
        </Text>
      )}
      {onlineSearchEnabled && !onlineSearchAvailable && (
        <Text
          id='missing-token-online-status'
          className='missing-queue__offline'
        >
          在线补图尚未配置，现有图板和离线沟通仍可正常使用。
        </Text>
      )}
      {onlineSearchReady && (
        <Text
          id='missing-token-online-status'
          className='missing-queue__offline'
        >
          联网时只发送单个缺词；ARASAAC / OpenSymbols 候选采用前必须人工确认。
        </Text>
      )}
      {localResolvedCount > 0 && (
        <Text
          id='missing-token-local-resolution-notice'
          className='missing-queue__notice'
        >
          本机 CBoard 已自动解决 {localResolvedCount} 个过期缺图词。
        </Text>
      )}
      {notice && (
        <Text
          id='missing-token-notice'
          className='missing-queue__notice'
        >
          {notice}
        </Text>
      )}

      {visibleRecords.length ? (
        <View className='missing-queue__list'>
          {visibleRecords.map(record => {
            const isPending = record.status === 'new' || record.status === 'suggested'
            const isBusy = busyRecordIds.includes(record.id)
            const resolvedCandidate = catalog.find(
              candidate => candidate.tile.id === record.resolvedPictogramId
            )
            const latestSample = Array.isArray(record.rawTextSamples)
              ? record.rawTextSamples[0]
              : ''
            const onlineSuggestions = getMissingTokenSuggestions(record)
            const onlineResolution = record.resolvedPictogram

            return (
              <View className='missing-queue__card' key={record.id}>
                <View className='missing-queue__card-body'>
                  <View className='missing-queue__token-row'>
                    <Text className='missing-queue__token'>{record.normalizedToken}</Text>
                    <Text className={`missing-queue__status missing-queue__status--${record.status}`}>
                      {STATUS_LABELS[record.status]}
                    </Text>
                  </View>
                  <Text className='missing-queue__meta'>出现次数：{record.occurrenceCount}</Text>
                  {latestSample && (
                    <Text className='missing-queue__meta'>最近原句：{latestSample}</Text>
                  )}
                  {record.status === 'resolved' && (resolvedCandidate || onlineResolution) && (
                    <Text className='missing-queue__meta'>
                      已关联：{resolvedCandidate ? getCandidateLabel(resolvedCandidate) : (onlineResolution ? onlineResolution.label : '')}
                    </Text>
                  )}
                  {record.status === 'resolved' &&
                    isDevicePrivateResolution(record) && (
                      <Text className='missing-queue__meta'>
                        仅本机私图，不会进入账号同步或公开图板
                      </Text>
                    )}
                </View>

                {onlineSuggestions.length > 0 && record.status === 'suggested' && (
                  <View className='missing-queue__online-candidates'>
                    {onlineSuggestions.map((onlineSuggestion, index) => (
                      <View
                        className='missing-queue__online-candidate'
                        key={onlineSuggestion.id}
                      >
                        <PictogramImage
                          className='missing-queue__online-image'
                          src={onlineSuggestion.image}
                          label={onlineSuggestion.label}
                        />
                        <View className='missing-queue__online-copy'>
                          <Text className='missing-queue__online-label'>{onlineSuggestion.label}</Text>
                          <Text className='missing-queue__online-source'>
                            来源：{onlineSuggestion.source.name} · {onlineSuggestion.source.license}
                          </Text>
                          <Button
                            id={index === 0
                              ? `missing-token-accept-online-${record.id}`
                              : `missing-token-accept-online-${record.id}-${index}`}
                            className='missing-queue__action missing-queue__action--primary'
                            disabled={isBusy}
                            onClick={() => void acceptOnline(record.id, onlineSuggestion.id)}
                          >
                            {isBusy ? '正在保存' : '确认采用并离线保存'}
                          </Button>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View className='missing-queue__actions'>
                  {isPending ? (
                    <>
                      <Button
                        className='missing-queue__action missing-queue__action--primary'
                        onClick={() => {
                          setActiveRecordId(record.id)
                          setQuery('')
                        }}
                      >
                        关联现有图卡
                      </Button>
                      <Button
                        id={`missing-token-private-image-${record.id}`}
                        className='missing-queue__action'
                        disabled={isBusy}
                        onClick={() => void resolveWithPrivateImage(record)}
                      >
                        {isBusy ? '正在保存' : '拍照或选择本机图片'}
                      </Button>
                      <Button
                        id={`missing-token-generate-ai-${record.id}`}
                        className='missing-queue__action'
                        disabled={isBusy}
                        onClick={() => void generateAiPictogram(record)}
                      >
                        {isBusy ? '正在处理' : 'AI 生成图符'}
                      </Button>
                      {onlineSearchReady && (
                        <Button
                          className='missing-queue__action'
                          disabled={isBusy}
                          onClick={() => void searchOnline([record.id])}
                        >
                          {isBusy ? '搜索中' : '重新在线搜索'}
                        </Button>
                      )}
                      <Button
                        className='missing-queue__action'
                        onClick={() => applyReview(record.id, { status: 'ignored' })}
                      >
                        忽略
                      </Button>
                    </>
                  ) : (
                    <Button
                      id={`missing-token-restore-${record.id}`}
                      className='missing-queue__action'
                      disabled={isBusy}
                      onClick={() => void restorePendingRecord(record)}
                    >
                      {isBusy ? '正在清理' : '恢复待处理'}
                    </Button>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      ) : (
        <Text className='missing-queue__empty'>暂时没有需要维护的缺图词。</Text>
      )}

      {generatedCandidate && (
        <View
          id='missing-token-ai-preview'
          className='missing-queue__picker'
        >
          <View className='missing-queue__picker-heading'>
            <View>
              <Text className='missing-queue__picker-title'>
                确认 AI 生成图符
              </Text>
              <Text className='missing-queue__hint'>
                请核对图片是否准确表达“{generatedCandidate.token}”。AI 图片不能作为公开许可素材。
              </Text>
            </View>
          </View>
          <View className='missing-queue__online-candidates'>
            <View className='missing-queue__online-candidate'>
              <PictogramImage
                className='missing-queue__online-image'
                src={generatedCandidate.pictogram.image}
                label={generatedCandidate.pictogram.label}
              />
              <View className='missing-queue__online-copy'>
                <Text className='missing-queue__online-label'>
                  {generatedCandidate.pictogram.label}
                </Text>
                <Text className='missing-queue__online-source'>
                  生成服务：{generatedCandidate.provider}
                </Text>
                <Text className='missing-queue__online-source'>
                  模型：{generatedCandidate.model}
                </Text>
                <Text className='missing-queue__online-source'>
                  仅保存在当前设备；使用受模型服务条款约束
                </Text>
              </View>
            </View>
          </View>
          <View className='missing-queue__actions'>
            <Button
              id='missing-token-confirm-ai'
              className='missing-queue__action missing-queue__action--primary'
              onClick={() => void confirmGeneratedCandidate()}
            >
              确认并保存
            </Button>
            <Button
              id='missing-token-discard-ai'
              className='missing-queue__action'
              onClick={() => void discardGeneratedCandidate()}
            >
              放弃并删除临时图片
            </Button>
          </View>
        </View>
      )}

      {activeRecord && (
        <View className='missing-queue__picker'>
          <View className='missing-queue__picker-heading'>
            <View>
              <Text className='missing-queue__picker-title'>
                为“{activeRecord.normalizedToken}”关联图卡
              </Text>
              <Text className='missing-queue__hint'>从现有 CBoard 图卡中选择正确含义</Text>
            </View>
            <Button
              className='missing-queue__picker-close'
              onClick={() => setActiveRecordId(null)}
            >
              关闭
            </Button>
          </View>
          <Input
            className='missing-queue__search'
            value={query}
            placeholder='搜索图卡标签或同义词'
            onInput={event => setQuery(event.detail.value)}
          />
          {filteredCatalog.length ? (
            <View className='missing-queue__catalog'>
              {filteredCatalog.map(candidate => (
                <Button
                  className='missing-queue__candidate'
                  key={candidate.id}
                  style={{ backgroundColor: candidate.tile.backgroundColor }}
                  onClick={() =>
                    applyReview(activeRecord.id, {
                      status: 'resolved',
                      resolvedPictogramId: candidate.tile.id,
                      source: 'caregiver'
                    })
                  }
                >
                  <PictogramImage
                    className='missing-queue__candidate-image'
                    src={candidate.tile.image}
                    label={getCandidateLabel(candidate)}
                    mediaType={candidate.tile.mediaType}
                    video={candidate.tile.video}
                  />
                  <Text className='missing-queue__candidate-label'>
                    {getCandidateLabel(candidate)}
                  </Text>
                  <Text className='missing-queue__candidate-board'>{candidate.boardName}</Text>
                </Button>
              ))}
            </View>
          ) : (
            <Text className='missing-queue__empty'>没有找到可关联的图卡。</Text>
          )}
        </View>
      )}
    </View>
  )
}
