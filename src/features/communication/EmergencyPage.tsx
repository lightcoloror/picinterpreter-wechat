import { useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import {
  EMERGENCY_COMMUNICATION_PHRASES,
  buildEmergencyCommunicationFallback,
  type EmergencyCommunicationPhrase
} from '@cboard-communication-core/emergencyCommunication'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'

import { wechatSpeechPort } from '../../platform/taroSpeechPort'
import { getEmergencyCommunicationImage } from './emergencyAssets'
import PatientActionButton from './PatientActionButton'
import PictogramImage from '../../components/PictogramImage'
import './EmergencyPage.css'

interface EmergencyPageProps {
  speechRate: number
  onClose: () => void
}

export default function EmergencyPage({ speechRate, onClose }: EmergencyPageProps) {
  const [fallbackText, setFallbackText] = useState('')
  const [notice, setNotice] = useState('点一个大按钮即可立即朗读。')
  const [activePhraseId, setActivePhraseId] = useState('')
  const generationRef = useRef(0)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFallbackTimer = () => {
    if (!fallbackTimerRef.current) return
    clearTimeout(fallbackTimerRef.current)
    fallbackTimerRef.current = null
  }

  useEffect(
    () => () => {
      generationRef.current += 1
      clearFallbackTimer()
      wechatSpeechPort.stop()
    },
    []
  )

  const speak = async (phrase: EmergencyCommunicationPhrase) => {
    const generation = ++generationRef.current
    clearFallbackTimer()
    setFallbackText('')
    setActivePhraseId(phrase.id)
    setNotice(`正在朗读：${phrase.text}`)

    const result = await wechatSpeechPort.speak(phrase.text, { rate: speechRate })
    if (generation !== generationRef.current) return
    setActivePhraseId('')
    setNotice(result.message)

    if (result.ok) return
    const fallback = buildEmergencyCommunicationFallback(phrase.id)
    if (!fallback) return
    setFallbackText(fallback.text)
    fallbackTimerRef.current = setTimeout(() => {
      if (generationRef.current === generation) setFallbackText('')
      fallbackTimerRef.current = null
    }, fallback.visibleDurationMs)
  }

  const close = () => {
    generationRef.current += 1
    clearFallbackTimer()
    wechatSpeechPort.stop()
    onClose()
  }

  return (
    <View className='emergency-page'>
      <View className='emergency-header'>
        <View>
          <Text className='emergency-header__eyebrow'>图语家 · 一键表达</Text>
          <Text className='emergency-header__title'>紧急求助</Text>
        </View>
        <PatientActionButton
          action={PATIENT_ACTION_IDS.back}
          className='emergency-header__close'
          onClick={close}
          label='返回'
          ariaLabel='返回沟通页面'
        />
      </View>

      <View className='emergency-grid'>
        {EMERGENCY_COMMUNICATION_PHRASES.map(phrase => {
          const image = getEmergencyCommunicationImage(phrase.id)
          return (
            <Button
              id={`emergency-${phrase.id}`}
              className={`emergency-phrase emergency-phrase--${phrase.tone}`}
              key={phrase.id}
              disabled={Boolean(activePhraseId)}
              ariaLabel={`朗读紧急短句：${phrase.text}`}
              onClick={() => void speak(phrase)}
            >
              <View className='emergency-phrase__image-shell'>
                {image ? (
                  <PictogramImage
                    className='emergency-phrase__image'
                    src={image}
                    label={phrase.label}
                  />
                ) : (
                  <Text className='emergency-phrase__missing'>缺少图卡</Text>
                )}
              </View>
              <Text className='emergency-phrase__label'>{phrase.label}</Text>
              <Text className='emergency-phrase__sound'>▶ 朗读</Text>
            </Button>
          )
        })}
      </View>

      <Text className='emergency-notice'>{notice}</Text>
      <Text className='emergency-credit'>
        图卡来源：CBoard、Mulberry Symbols、ARASAAC
      </Text>

      {fallbackText && (
        <View className='emergency-fallback' role='alert'>
          <Text className='emergency-fallback__hint'>语音暂时不可用，请直接给照护者看</Text>
          <Text className='emergency-fallback__text'>{fallbackText}</Text>
          <PatientActionButton
            action={PATIENT_ACTION_IDS.confirm}
            className='emergency-fallback__close'
            onClick={() => setFallbackText('')}
            label='知道了'
            ariaLabel='关闭文字求助提示'
          />
        </View>
      )}
    </View>
  )
}
