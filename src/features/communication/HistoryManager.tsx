import { useMemo, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import {
  CANDIDATE_FEEDBACK,
  normalizeExpressionCandidates
} from '@cboard-communication-core/candidateFeedback'
import {
  getCommunicationHistoryPatientFeedbackText,
  groupCommunicationHistoryBySession
} from '@cboard-communication-core/historyManagement'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type { CommunicationHistoryEntry } from '@cboard-communication-core/repository'
import {
  RECEIVER_CORRECTION_ACTIONS,
  getEffectiveReceiverHistoryEntry,
  type ReceiverCorrectionEntry,
  type ReceiverDraftEntry
} from '@cboard-communication-core/receiverLifecycle'
import {
  createReceiverReviewId,
  deleteReceiverReviewItem,
  insertReceiverReviewItem,
  moveReceiverReviewItem,
  replaceReceiverReviewItem
} from '@cboard-communication-core/receiverPipeline'
import {
  buildCommunicationTileCatalog,
  type CommunicationCatalogItem
} from '@cboard-communication-core/symbolMatching'

import { taroCommunicationFilePort } from '../../platform/taroCommunicationFilePort'
import { wechatSpeechPort } from '../../platform/taroSpeechPort'
import type { CommunicationManagementService } from './management'
import PictogramImage from '../../components/PictogramImage'
import {
  buildHistoryReceiverReviewCorrection,
  createHistoryReceiverReviewState,
  type HistoryReceiverReviewState
} from './historyReceiverReview'
import './CommunicationManagement.css'

interface HistoryManagerProps {
  service: CommunicationManagementService
  items: CommunicationHistoryEntry[]
  boards: BoardDTO[]
  receiverCorrections: ReceiverCorrectionEntry[]
  speechRate: number
  candidateFeedbackSyncAvailable: boolean
  onItemsChange: (items: CommunicationHistoryEntry[]) => void
  onRecordReceiverCorrection: (entry: ReceiverCorrectionEntry) => boolean
}

export default function HistoryManager({
  service,
  items,
  boards,
  receiverCorrections,
  speechRate,
  candidateFeedbackSyncAvailable,
  onItemsChange,
  onRecordReceiverCorrection
}: HistoryManagerProps) {
  const [notice, setNotice] = useState('最多保留并显示最近 100 条。')
  const [confirmClear, setConfirmClear] = useState(false)
  const [receiverReview, setReceiverReview] =
    useState<HistoryReceiverReviewState | null>(null)
  const [receiverPicker, setReceiverPicker] = useState<{
    mode: 'replace' | 'insert'
    itemId: string
  } | null>(null)
  const [receiverPickerQuery, setReceiverPickerQuery] = useState('')
  const groups = groupCommunicationHistoryBySession(items)
  const catalog = useMemo(
    () => buildCommunicationTileCatalog(boards),
    [boards]
  )
  const receiverPickerCandidates = useMemo(() => {
    const query = receiverPickerQuery.trim().toLowerCase()
    return catalog
      .filter(candidate => {
        if (!query) return true
        return [
          candidate.displayLabel,
          ...(candidate.labels || []),
          ...(candidate.synonyms || [])
        ].some(value =>
          String(value || '').toLowerCase().includes(query)
        )
      })
      .slice(0, 24)
  }, [catalog, receiverPickerQuery])

  const replay = async (item: CommunicationHistoryEntry) => {
    const text = service.getHistoryReplayText(item)
    if (!text) {
      setNotice('这条记录没有可朗读文字。')
      return
    }
    setNotice('正在朗读…')
    const result = await wechatSpeechPort.speak(text, { rate: speechRate })
    setNotice(result.message)
  }

  const exportText = async () => {
    const result = await taroCommunicationFilePort.exportText(
      `图语家_对话记录_${Date.now()}.txt`,
      service.exportHistory()
    )
    setNotice(result.message)
  }

  const exportOpenBoardLog = async () => {
    const result = await taroCommunicationFilePort.exportText(
      '图语家_标准沟通日志_' + Date.now() + '.obl',
      service.exportHistoryOpenBoardLog()
    )
    setNotice(
      result.ok
        ? '标准沟通日志已打开，请作为包含沟通原文的私密文件保管。'
        : result.message
    )
  }

  const exportAnonymizedOpenBoardLog = async () => {
    const result = await taroCommunicationFilePort.exportText(
      '图语家_匿名研究日志_' + Date.now() + '.obla',
      service.exportHistoryAnonymizedOpenBoardLog()
    )
    setNotice(
      result.ok
        ? '匿名研究日志已打开；原文已不可逆遮蔽，不能用于恢复对话。'
        : result.message
    )
  }

  const importOpenBoardLog = async () => {
    const file = await taroCommunicationFilePort.importText(['obl'])
    if (!file.ok || !file.value) {
      setNotice(file.message)
      return
    }
    const result = service.importHistoryOpenBoardLog(file.value)
    if (!result.ok) {
      setNotice(result.error || '标准沟通日志无法导入。')
      return
    }
    if (result.addedCount) onItemsChange(result.items)
    const unsupportedNotice = result.unsupportedEventCount
      ? `，忽略 ${result.unsupportedEventCount} 个非文字事件`
      : ''
    setNotice(
      `已导入 ${result.addedCount} 条，跳过 ${
        result.skippedCount
      } 条${unsupportedNotice}。导入记录只保存在本机。`
    )
  }

  const updateCandidateFeedback = (
    item: CommunicationHistoryEntry,
    candidateIndex: number,
    feedback: 'up' | 'down'
  ) => {
    if (!item.id) return
    onItemsChange(
      service.updateHistoryCandidateFeedback(
        item.id,
        candidateIndex,
        feedback
      )
    )
    setNotice(
      candidateFeedbackSyncAvailable
        ? '候选句反馈已保存，并会纳入下次云同步。'
        : '候选句反馈已保存在本机，登录后可同步。'
    )
  }

  const getDisplayItem = (
    item: CommunicationHistoryEntry
  ): CommunicationHistoryEntry => {
    if (
      item.direction !== 'receive' ||
      item.recordStatus !== 'confirmed' ||
      !item.id
    ) {
      return item
    }
    return getEffectiveReceiverHistoryEntry(
      item as ReceiverDraftEntry,
      receiverCorrections
    )
  }

  const startReceiverReview = (item: CommunicationHistoryEntry) => {
    const next = createHistoryReceiverReviewState(
      item,
      receiverCorrections,
      boards
    )
    if (!next) {
      setNotice('这条旧记录没有可恢复的图片序列，暂时不能修正。')
      return
    }
    setReceiverReview(next)
    setReceiverPicker(null)
    setReceiverPickerQuery('')
    setNotice('历史修正只追加审计证据，不覆盖患者当时看到的原记录。')
  }

  const closeReceiverReview = () => {
    setReceiverReview(null)
    setReceiverPicker(null)
    setReceiverPickerQuery('')
  }

  const persistReceiverReview = (
    action: string,
    itemId: string,
    nextItems: HistoryReceiverReviewState['reviewItems']
  ) => {
    if (!receiverReview || nextItems === receiverReview.reviewItems) {
      return false
    }
    try {
      const correction = buildHistoryReceiverReviewCorrection(
        receiverReview,
        action,
        nextItems,
        itemId
      )
      if (!onRecordReceiverCorrection(correction)) {
        setNotice('历史图片修正未能保存，请重试。')
        return false
      }
      setReceiverReview(current =>
        current && current.record.id === receiverReview.record.id
          ? { ...current, reviewItems: nextItems }
          : current
      )
      setNotice('历史图片修正已保存，原记录和修正证据均已保留。')
      return true
    } catch (error) {
      setNotice('这次历史图片修正无效，原记录未被改动。')
      return false
    }
  }

  const chooseReceiverPictogram = (
    candidate: CommunicationCatalogItem
  ) => {
    if (!receiverReview || !receiverPicker) return

    if (receiverPicker.mode === 'replace') {
      persistReceiverReview(
        RECEIVER_CORRECTION_ACTIONS.replace,
        receiverPicker.itemId,
        replaceReceiverReviewItem(
          receiverReview.reviewItems,
          receiverPicker.itemId,
          candidate
        )
      )
    } else {
      const insertedId = createReceiverReviewId('history-review')
      persistReceiverReview(
        RECEIVER_CORRECTION_ACTIONS.insert,
        insertedId,
        insertReceiverReviewItem(
          receiverReview.reviewItems,
          receiverPicker.itemId,
          candidate,
          { itemId: insertedId }
        )
      )
    }
    setReceiverPicker(null)
    setReceiverPickerQuery('')
  }

  return (
    <View className='panel history-manager'>
      <View className='section-heading'>
        <Text className='section-heading__index'>记</Text>
        <View>
          <Text className='section-heading__title'>对话历史</Text>
          <Text className='section-heading__hint'>表达与接收按同一会话分组</Text>
        </View>
      </View>

      <View className='history-manager__toolbar'>
        <Button className='button button--outline' disabled={!items.length} onClick={() => void exportText()}>
          导出文本
        </Button>
        <Button
          id='history-export-open-board-log'
          className='button button--outline'
          disabled={!items.length}
          onClick={() => void exportOpenBoardLog()}
        >
          导出标准日志
        </Button>
        <Button
          id='history-export-anonymized-open-board-log'
          className='button button--outline'
          disabled={!items.length}
          onClick={() => void exportAnonymizedOpenBoardLog()}
        >
          导出匿名研究日志
        </Button>
        <Button
          className='button button--outline'
          onClick={() => void importOpenBoardLog()}
        >
          导入标准日志
        </Button>
        <Button
          className='button button--outline'
          disabled={!items.length}
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true)
              setNotice('再次点击“确认清空”才会删除全部历史。')
              return
            }
            onItemsChange(service.clearHistory())
            setConfirmClear(false)
            setNotice('全部历史已清空。')
          }}
        >
          {confirmClear ? '确认清空' : '清空全部'}
        </Button>
      </View>
      <Text className='history-manager__privacy'>
        标准日志采用 OpenAAC .obl 0.1，包含沟通原文；导入只合并文字事件并留在本机，不读取姓名、设备或位置字段。匿名 .obla 会遮蔽全部原文、平移并扰动时间，只用于研究分析，不能恢复原始对话。
      </Text>

      {groups.length ? groups.map((group, groupIndex) => (
        <View className='history-manager__session' key={group.sessionId}>
          <Text className='history-manager__session-title'>会话 {groups.length - groupIndex}</Text>
          {[...group.items].reverse().map(item => {
            const displayItem = getDisplayItem(item)
            const isReviewing =
              receiverReview && receiverReview.record.id === item.id
            return (
            <View className='history-manager__row' key={item.id}>
              <Text className={`history-row__direction history-row__direction--${item.direction}`}>
                {item.direction === 'receive' ? '接收' : '表达'}
              </Text>
              <View className='history-manager__copy'>
                <Text className='history-row__text'>{service.getHistoryReplayText(displayItem)}</Text>
                <Text className='history-row__labels'>{displayItem.labels.join(' · ')}</Text>
                {item.importSource === 'open-board-log' && (
                  <Text className='history-row__revision'>
                    标准日志导入 · 仅本机
                  </Text>
                )}
                {!!displayItem.receiverHistoryRevision && (
                  <Text className='history-row__revision'>已有照护者图片修正</Text>
                )}
                {!!getCommunicationHistoryPatientFeedbackText(item) && (
                  <Text className={`history-row__feedback history-row__feedback--${item.patientFeedback}`}>
                    {getCommunicationHistoryPatientFeedbackText(item)}
                  </Text>
                )}
                {item.direction === 'express' && (
                  <View className='history-candidate-list'>
                    {normalizeExpressionCandidates(
                      item.candidates,
                      item.candidateSentences
                    ).map((candidate, candidateIndex) => (
                      <View
                        className='history-candidate'
                        key={`${item.id || 'history'}-${candidateIndex}`}
                      >
                        <Text className='history-candidate__sentence'>
                          {candidate.sentence}
                        </Text>
                        <View className='history-candidate__feedback'>
                          <Button
                            id={`history-candidate-${item.id}-${candidateIndex}-up`}
                            className={`candidate-feedback__button ${
                              candidate.feedback === CANDIDATE_FEEDBACK.up
                                ? 'candidate-feedback__button--active'
                                : ''
                            }`}
                            aria-label={`有帮助：${candidate.sentence}`}
                            aria-pressed={
                              candidate.feedback === CANDIDATE_FEEDBACK.up
                            }
                            onClick={() =>
                              updateCandidateFeedback(
                                item,
                                candidateIndex,
                                CANDIDATE_FEEDBACK.up
                              )
                            }
                          >
                            有帮助
                          </Button>
                          <Button
                            id={`history-candidate-${item.id}-${candidateIndex}-down`}
                            className={`candidate-feedback__button ${
                              candidate.feedback === CANDIDATE_FEEDBACK.down
                                ? 'candidate-feedback__button--active'
                                : ''
                            }`}
                            aria-label={`不符合：${candidate.sentence}`}
                            aria-pressed={
                              candidate.feedback === CANDIDATE_FEEDBACK.down
                            }
                            onClick={() =>
                              updateCandidateFeedback(
                                item,
                                candidateIndex,
                                CANDIDATE_FEEDBACK.down
                              )
                            }
                          >
                            不符合
                          </Button>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View className='history-manager__actions'>
                <Button className='review-action' onClick={() => void replay(displayItem)}>重播</Button>
                {item.direction === 'receive' &&
                  item.recordStatus === 'confirmed' &&
                  Array.isArray(item.pictogramSequence) && (
                    <Button
                      id={`history-receiver-review-${item.id}`}
                      className='review-action review-action--receiver'
                      onClick={() =>
                        isReviewing
                          ? closeReceiverReview()
                          : startReceiverReview(item)
                      }
                    >
                      {isReviewing ? '完成修正' : '修正图片'}
                    </Button>
                  )}
                <Button
                  className='review-action'
                  disabled={!item.id}
                  onClick={() => {
                    if (item.id) onItemsChange(service.toggleHistoryFavorite(item.id))
                  }}
                >{item.isFavorite ? '取消收藏' : '收藏'}</Button>
                <Button
                  className='review-action review-action--delete'
                  disabled={!item.id}
                  onClick={() => {
                    if (item.id) onItemsChange(service.deleteHistory(item.id))
                  }}
                >删除</Button>
              </View>
              {isReviewing && receiverReview && (
                <View className='history-receiver-review'>
                  <Text className='history-receiver-review__title'>
                    照护者修正图片序列
                  </Text>
                  <Text className='history-receiver-review__hint'>
                    每次操作立即保存审计，原记录不会被覆盖。
                  </Text>
                  <View className='history-receiver-review__sequence'>
                    {receiverReview.reviewItems.map((reviewItem, reviewIndex) => (
                      <View
                        className='history-receiver-review__item'
                        key={reviewItem.id}
                      >
                        {reviewItem.tile ? (
                          <PictogramImage
                            className='history-receiver-review__image'
                            src={reviewItem.tile.tile.image}
                            label={reviewItem.tile.displayLabel || reviewItem.token}
                            mediaType={reviewItem.tile.tile.mediaType}
                            video={reviewItem.tile.tile.video}
                          />
                        ) : (
                          <Text className='history-receiver-review__missing'>?</Text>
                        )}
                        <Text className='history-receiver-review__token'>
                          {reviewItem.token}
                        </Text>
                        <View className='history-receiver-review__actions'>
                          <Button
                            className='review-action'
                            disabled={reviewIndex === 0}
                            onClick={() =>
                              persistReceiverReview(
                                RECEIVER_CORRECTION_ACTIONS.reorder,
                                reviewItem.id,
                                moveReceiverReviewItem(
                                  receiverReview.reviewItems,
                                  reviewItem.id,
                                  -1
                                )
                              )
                            }
                          >
                            左移
                          </Button>
                          <Button
                            className='review-action'
                            disabled={
                              reviewIndex ===
                              receiverReview.reviewItems.length - 1
                            }
                            onClick={() =>
                              persistReceiverReview(
                                RECEIVER_CORRECTION_ACTIONS.reorder,
                                reviewItem.id,
                                moveReceiverReviewItem(
                                  receiverReview.reviewItems,
                                  reviewItem.id,
                                  1
                                )
                              )
                            }
                          >
                            右移
                          </Button>
                          <Button
                            className='review-action review-action--receiver'
                            onClick={() => {
                              setReceiverPicker({
                                mode: 'replace',
                                itemId: reviewItem.id
                              })
                              setReceiverPickerQuery('')
                            }}
                          >
                            换图
                          </Button>
                          <Button
                            className='review-action review-action--receiver'
                            onClick={() => {
                              setReceiverPicker({
                                mode: 'insert',
                                itemId: reviewItem.id
                              })
                              setReceiverPickerQuery('')
                            }}
                          >
                            后面加图
                          </Button>
                          <Button
                            className='review-action review-action--delete'
                            onClick={() =>
                              persistReceiverReview(
                                RECEIVER_CORRECTION_ACTIONS.delete,
                                reviewItem.id,
                                deleteReceiverReviewItem(
                                  receiverReview.reviewItems,
                                  reviewItem.id
                                )
                              )
                            }
                          >
                            删除
                          </Button>
                        </View>
                      </View>
                    ))}
                    {!receiverReview.reviewItems.length && (
                      <Text className='history-receiver-review__empty'>
                        当前修订序列为空，可以从图片目录添加。
                      </Text>
                    )}
                  </View>
                  <Button
                    className='button button--outline history-receiver-review__append'
                    onClick={() => {
                      setReceiverPicker({
                        mode: 'insert',
                        itemId: receiverReview.reviewItems.length
                          ? receiverReview.reviewItems[
                              receiverReview.reviewItems.length - 1
                            ].id
                          : ''
                      })
                      setReceiverPickerQuery('')
                    }}
                  >
                    在末尾添加图片
                  </Button>
                  {receiverPicker && (
                    <View
                      className='history-receiver-picker'
                      aria-label={
                        receiverPicker.mode === 'replace'
                          ? '选择替换图片'
                          : '选择新增图片'
                      }
                    >
                      <Input
                        className='history-receiver-picker__input'
                        placeholder='搜索图片或词语'
                        value={receiverPickerQuery}
                        onInput={event =>
                          setReceiverPickerQuery(event.detail.value)
                        }
                      />
                      <View className='history-receiver-picker__grid'>
                        {receiverPickerCandidates.map(candidate => (
                          <Button
                            id={`history-receiver-candidate-${candidate.id}`}
                            className='history-receiver-picker__candidate'
                            key={candidate.id}
                            aria-label={`选择图片：${candidate.displayLabel}`}
                            onClick={() =>
                              chooseReceiverPictogram(candidate)
                            }
                          >
                            <PictogramImage
                              className='history-receiver-picker__image'
                              src={candidate.tile.image}
                              label={candidate.displayLabel}
                              mediaType={candidate.tile.mediaType}
                              video={candidate.tile.video}
                            />
                            <Text className='history-receiver-picker__label'>
                              {candidate.displayLabel}
                            </Text>
                          </Button>
                        ))}
                      </View>
                      {!receiverPickerCandidates.length && (
                        <Text className='history-receiver-review__empty'>
                          没有找到对应图片。
                        </Text>
                      )}
                      <Button
                        className='review-action'
                        onClick={() => setReceiverPicker(null)}
                      >
                        关闭图片目录
                      </Button>
                    </View>
                  )}
                </View>
              )}
            </View>
            )
          })}
        </View>
      )) : <Text className='history-list__empty'>还没有已确认的沟通记录。</Text>}

      <Text className='storage-notice'>{notice}</Text>
    </View>
  )
}
