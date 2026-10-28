import { useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { buildReceiverReading } from '@cboard-communication-core/receiverReading'
import type { ReceiverHistoryEntry } from '@cboard-communication-core/receiverPipeline'
import { buildReceiverMeaningAssessment, isReceiverPunctuation } from '@cboard-communication-core/receiverPipeline'
import { ScrollView, Text, View } from '@tarojs/components'
import type { CommunicationOutputItem } from '@cboard-communication-core/symbolMatching'
import {
  RECEIVER_PATIENT_FEEDBACK,
  type ReceiverPatientFeedback
} from '@cboard-communication-core/receiverPatientFeedback'
import {
  formatPictogramAttribution
} from '@cboard-communication-core/pictogramAttribution'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'

import { wechatSpeechPort } from '../../platform/taroSpeechPort'
import { taroCommunicationSharePort } from '../../platform/taroCommunicationSharePort'
import type {
  ReceiverDisplayCloseResult
} from './receiverSession'
import PatientActionButton from './PatientActionButton'
import PictogramImage from '../../components/PictogramImage'

interface ReceiverDisplayPageProps {
  items: CommunicationOutputItem[]
  recordId: string
  speechText: string
  sequence?: ReceiverHistoryEntry['pictogramSequence']
  startSegmented?: boolean
  autoPlay?: boolean
  speechRate: number
  highContrast: boolean
  onFeedback: (
    recordId: string,
    feedback: ReceiverPatientFeedback
  ) => boolean
  onClose: (result?: ReceiverDisplayCloseResult) => void
}

export default function ReceiverDisplayPage({
  items,
  recordId,
  speechText,
  sequence = [],
  startSegmented = false,
  autoPlay = true,
  speechRate,
  highContrast,
  onFeedback,
  onClose
}: ReceiverDisplayPageProps) {
  const reading = buildReceiverReading(speechText, sequence, items)
  const [segmentIndex, setSegmentIndex] = useState<number | null>(startSegmented && reading.canSegment ? 0 : null)
  const segment = segmentIndex === null ? null : reading.segments[segmentIndex]
  const visibleItems = segment ? segment.itemIndices.map(index => items[index]) : items
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechNotice, setSpeechNotice] = useState('')
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
  const speechGenerationRef = useRef(0)
  const shareGenerationRef = useRef(0)
  const sharePendingRef = useRef(false)
  const disposedRef = useRef(false)
  const attributedItems = items
    .map((item, index) => ({
      key: `${item.id}-${index}`,
      label: item.label,
      details: formatPictogramAttribution(item.attribution)
    }))
    .filter(item => item.details)

  const stopPlayback = () => {
    speechGenerationRef.current += 1
    wechatSpeechPort.stop()
    setIsSpeaking(false)
    setSpeechNotice('')
  }
  const changeReading = (index: number | null) => {
    stopPlayback()
    shareGenerationRef.current += 1
    sharePendingRef.current = false
    setIsSharing(false)
    setShareNotice('')
    setSegmentIndex(index)
  }
  const speak = async () => {
    if (disposedRef.current) return
    const generation = ++speechGenerationRef.current
    wechatSpeechPort.stop()
    setIsSpeaking(true)
    setSpeechNotice('正在朗读…')
    const result = await wechatSpeechPort.speak(segment ? segment.text : speechText, { rate: speechRate })
    if (generation !== speechGenerationRef.current) return
    setIsSpeaking(false)
    setSpeechNotice(result.message)
  }

  useEffect(() => {
    disposedRef.current = false
    if (autoPlay && !startSegmented) void speak()
    return () => {
      disposedRef.current = true
      shareGenerationRef.current += 1
      sharePendingRef.current = false
      speechGenerationRef.current += 1
      wechatSpeechPort.stop()
    }
    // The display payload is immutable; automatic playback should only run on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDidHide(() => {
    disposedRef.current = true
    shareGenerationRef.current += 1
    sharePendingRef.current = false
    setIsSharing(false)
    stopPlayback()
  })
  useDidShow(() => { disposedRef.current = false })

  const handleClose = (result?: ReceiverDisplayCloseResult) => {
    if (disposedRef.current) return
    disposedRef.current = true
    shareGenerationRef.current += 1
    sharePendingRef.current = false
    speechGenerationRef.current += 1
    wechatSpeechPort.stop()
    onClose(result)
  }

  const handleFeedback = (feedback: ReceiverPatientFeedback) => {
    if (disposedRef.current) return
    let saved = false
    try {
      saved = onFeedback(recordId, feedback)
    } catch (error) {
      saved = false
    }

    if (feedback === RECEIVER_PATIENT_FEEDBACK.repeatRequested) {
      setFeedbackNotice(
        saved
          ? '已记录：请再说一次。'
          : '反馈未保存，但仍会再说一次。'
      )
      void speak()
      return
    }

    handleClose({ feedback, saved })
  }

  const handleShare = async () => {
    if (disposedRef.current || sharePendingRef.current) return
    const generation = ++shareGenerationRef.current
    const isCurrent = () => !disposedRef.current && generation === shareGenerationRef.current
    sharePendingRef.current = true
    setIsSharing(true)
    setShareNotice('正在生成可分享图片…')
    try {
      const result = await taroCommunicationSharePort.shareReceiverImage(
        items,
        { speechText, isCurrent }
      )
      if (isCurrent()) setShareNotice(result.message)
    } catch (_) {
      if (isCurrent()) setShareNotice('图片分享失败，当前沟通内容仍会保留，请重试。')
    } finally {
      if (isCurrent()) {
        sharePendingRef.current = false
        setIsSharing(false)
      }
    }
  }

  return (
    <View
      className={[
        'receiver-display-page',
        highContrast ? 'receiver-display-page--high-contrast' : ''
      ].filter(Boolean).join(' ')}
    >
      <View className='receiver-display__header'>
        <Text className='receiver-display__eyebrow'>图语家 · 接收理解</Text>
        <Text className='receiver-display__title'>
          {isSpeaking ? '正在朗读' : '请看原句和图片'}
        </Text>
        <Text className='receiver-display__hint'>本页展示原句与已确认的图片序列</Text>
      </View>

      <View className='receiver-reading' id='receiver-reading'>
        <Text className='receiver-reading__original'>{speechText}</Text>
        <PatientActionButton action={PATIENT_ACTION_IDS.fullscreen} id='receiver-reading-toggle'
          label={segment ? '看整句' : '一段一段看'} ariaLabel={segment ? '返回完整原句和图片' : '按原文分段阅读'}
          disabled={!segment && !reading.canSegment} onClick={() => changeReading(segment ? null : 0)}
        />
        {!reading.canSegment && <Text>{reading.reason}</Text>}
        {segment && <View>
          <Text>第 {segmentIndex! + 1} / {reading.segments.length} 段：{segment.text}</Text>
          <PatientActionButton action={PATIENT_ACTION_IDS.moveLeft} id='receiver-reading-previous'
            label='上一段' ariaLabel='上一段' disabled={segmentIndex === 0} onClick={() => changeReading(segmentIndex! - 1)}
          />
          <PatientActionButton action={PATIENT_ACTION_IDS.moveRight} id='receiver-reading-next'
            label='下一段' ariaLabel='下一段' disabled={segmentIndex === reading.segments.length - 1} onClick={() => changeReading(segmentIndex! + 1)}
          />
        </View>}
      </View>
      <ScrollView
        id='receiver-display-sequence'
        className='receiver-display__grid'
        scrollX
        scrollY
        enhanced
        enableFlex
        showScrollbar
      >
        {visibleItems.map((item, index) => (
          <View className='receiver-display__card' key={`${item.id}-${index}`}>
            {item.textOnly ? <Text>{isReceiverPunctuation(item.label) ? '原文标点' : '尚未图示，请伙伴解释'}</Text> : <PictogramImage localOnly
              className='receiver-display__image'
              src={item.image}
              label={item.label}
              mediaType={item.mediaType}
              video={item.video}
              videoAutoplay={item.mediaType === 'video'}
            />}
            <Text className='receiver-display__label'>{item.label}</Text>
          </View>
        ))}
      </ScrollView>
      {buildReceiverMeaningAssessment(speechText, items.map(item => ({ id: item.id, token: item.label, matchType: 'manual', tile: { ...item, textOnly: item.textOnly, tile: item } }))).requiresAssistance &&
        <Text>文字仅供伙伴核对原话，请辅助解释并等待对方回应，不代表已经理解。</Text>}

      {attributedItems.length > 0 && (
        <View
          id='receiver-display-attribution'
          className='receiver-display__attribution'
        >
          <Text className='receiver-display__attribution-title'>
            图片来源与许可
          </Text>
          {attributedItems.map(item => (
            <Text
              className='receiver-display__attribution-row'
              key={item.key}
            >
              {item.label}：{item.details}
            </Text>
          ))}
        </View>
      )}

      <View
        id='receiver-feedback-panel'
        className='receiver-display__feedback'
      >
        <Text className='receiver-display__feedback-question'>
          你明白了吗？
        </Text>
        <View className='receiver-display__feedback-actions'>
          <PatientActionButton
            action={PATIENT_ACTION_IDS.understood}
            id='receiver-feedback-understood'
            className='receiver-display__feedback-button receiver-display__feedback-button--understood'
            onClick={() =>
              handleFeedback(RECEIVER_PATIENT_FEEDBACK.understood)
            }
            label='明白'
            ariaLabel='我明白了'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.notUnderstood}
            id='receiver-feedback-not-understood'
            className='receiver-display__feedback-button receiver-display__feedback-button--not-understood'
            onClick={() =>
              handleFeedback(RECEIVER_PATIENT_FEEDBACK.notUnderstood)
            }
            label='不懂'
            ariaLabel='我没有明白'
          />
          <PatientActionButton
            action={PATIENT_ACTION_IDS.repeat}
            id='receiver-feedback-repeat'
            className='receiver-display__feedback-button receiver-display__feedback-button--repeat'
            disabled={!speechText.trim()}
            onClick={() =>
              handleFeedback(RECEIVER_PATIENT_FEEDBACK.repeatRequested)
            }
            label='再说'
            ariaLabel='请再说一次'
          />
        </View>
      </View>
      {feedbackNotice && (
        <Text className='receiver-display__feedback-notice'>
          {feedbackNotice}
        </Text>
      )}

      <View className='receiver-display__caregiver-actions'>
        <PatientActionButton
          action={PATIENT_ACTION_IDS.share}
          id='receiver-display-share'
          className='button button--display-share'
          disabled={isSharing || !items.length}
          onClick={() => void handleShare()}
          label={isSharing ? '生成中' : '分享整句'}
          ariaLabel={
            isSharing ? '正在生成可分享图片' : '分享图片序列'
          }
        />
        <PatientActionButton
          action={PATIENT_ACTION_IDS.back}
          id='receiver-display-back'
          className='button button--display-back'
          onClick={() => handleClose()}
          label='返回'
          ariaLabel='返回接收理解'
        />
      </View>
      {shareNotice && (
        <Text
          id='receiver-display-share-notice'
          className='receiver-display__share-notice'
        >
          {shareNotice}
        </Text>
      )}
      {speechNotice && (
        <Text className='receiver-display__speech-notice'>{speechNotice}</Text>
      )}
    </View>
  )
}


