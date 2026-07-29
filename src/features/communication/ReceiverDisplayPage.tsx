import { useEffect, useRef, useState } from 'react'
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
  speechRate,
  highContrast,
  onFeedback,
  onClose
}: ReceiverDisplayPageProps) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechNotice, setSpeechNotice] = useState('')
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
  const speechGenerationRef = useRef(0)
  const attributedItems = items
    .map((item, index) => ({
      key: `${item.id}-${index}`,
      label: item.label,
      details: formatPictogramAttribution(item.attribution)
    }))
    .filter(item => item.details)

  const speak = async () => {
    const generation = ++speechGenerationRef.current
    wechatSpeechPort.stop()
    setIsSpeaking(true)
    setSpeechNotice('正在朗读…')
    const result = await wechatSpeechPort.speak(speechText, { rate: speechRate })
    if (generation !== speechGenerationRef.current) return
    setIsSpeaking(false)
    setSpeechNotice(result.message)
  }

  useEffect(() => {
    void speak()
    return () => {
      speechGenerationRef.current += 1
      wechatSpeechPort.stop()
    }
    // The display payload is immutable; automatic playback should only run on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClose = (result?: ReceiverDisplayCloseResult) => {
    speechGenerationRef.current += 1
    wechatSpeechPort.stop()
    onClose(result)
  }

  const handleFeedback = (feedback: ReceiverPatientFeedback) => {
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
    if (isSharing) return
    setIsSharing(true)
    setShareNotice('正在生成可分享图片…')
    const result = await taroCommunicationSharePort.shareReceiverImage(
      items,
      { speechText }
    )
    setShareNotice(result.message)
    setIsSharing(false)
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
          {isSpeaking ? '正在朗读' : '请看图片'}
        </Text>
        <Text className='receiver-display__hint'>本页只展示已确认的图片序列</Text>
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
        {items.map((item, index) => (
          <View className='receiver-display__card' key={`${item.id}-${index}`}>
            <PictogramImage
              className='receiver-display__image'
              src={item.image}
              label={item.label}
              mediaType={item.mediaType}
              video={item.video}
              videoAutoplay={item.mediaType === 'video'}
            />
            <Text className='receiver-display__label'>{item.label}</Text>
          </View>
        ))}
      </ScrollView>

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
          label={isSharing ? '生成中' : '分享'}
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


