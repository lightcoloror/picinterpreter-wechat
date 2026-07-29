import { ScrollView, Text, View } from '@tarojs/components'
import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
import {
  PATIENT_ACTION_IDS
} from '@cboard-communication-core/patientActionLanguage'
import PatientActionButton from './PatientActionButton'
import PictogramImage from '../../components/PictogramImage'

interface PhrasePlaybackOverlayProps {
  item: CommunicationSavedPhraseEntry | null
  isSpeaking: boolean
  status: string
  onReplay: () => Promise<void>
  onClose: () => void
}

export default function PhrasePlaybackOverlay({
  item,
  isSpeaking,
  status,
  onReplay,
  onClose
}: PhrasePlaybackOverlayProps) {
  if (!item) return null

  return (
    <View
      id='phrase-playback-overlay'
      className='phrase-playback-overlay'
      catchMove
      ariaRole='dialog'
      ariaLabel='常用语全屏播报'
    >
      <ScrollView scrollY className='phrase-playback-overlay__scroll'>
        <View className='phrase-playback-overlay__card'>
          {item.output.length > 0 && (
            <View className='phrase-playback-overlay__images'>
              {item.output.map((tile, index) => (
                <View
                  className='phrase-playback-overlay__figure'
                  key={`${tile.id}-${index}`}
                >
                  {tile.image ? (
                    <PictogramImage
                      className='phrase-playback-overlay__image'
                      src={tile.image}
                      label={tile.label}
                      mediaType={tile.mediaType}
                      video={tile.video}
                      videoAutoplay={tile.mediaType === 'video'}
                    />
                  ) : (
                    <Text className='phrase-playback-overlay__missing'>?</Text>
                  )}
                  <Text className='phrase-playback-overlay__label'>
                    {tile.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <Text className='phrase-playback-overlay__sentence'>
            {item.sentence}
          </Text>
          <Text className='phrase-playback-overlay__status'>
            {status}
          </Text>
          <View className='phrase-playback-overlay__actions'>
            <PatientActionButton
              action={PATIENT_ACTION_IDS.replay}
              id='phrase-playback-replay'
              className='phrase-playback-overlay__replay'
              disabled={isSpeaking}
              onClick={() => void onReplay()}
              label={isSpeaking ? '播报中' : '重播'}
              ariaLabel={isSpeaking ? '正在播报常用语' : '重新播报常用语'}
            />
            <PatientActionButton
              action={PATIENT_ACTION_IDS.back}
              id='phrase-playback-close'
              className='phrase-playback-overlay__close'
              onClick={onClose}
              label='完成'
              ariaLabel='完成并返回患者表达'
            />
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
