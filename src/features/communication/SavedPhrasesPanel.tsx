import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'

import PictogramImage from '../../components/PictogramImage'

interface SavedPhrasesPanelProps {
  items: CommunicationSavedPhraseEntry[]
  onReuse: (item: CommunicationSavedPhraseEntry) => void
  onPlay: (item: CommunicationSavedPhraseEntry) => Promise<void>
}

export default function SavedPhrasesPanel({
  items,
  onReuse,
  onPlay
}: SavedPhrasesPanelProps) {
  return (
    <View className='panel saved-phrases-panel'>
      <View className='section-heading'>
        <Text className='section-heading__index'>常</Text>
        <View>
          <Text className='section-heading__title'>常用语</Text>
          <Text className='section-heading__hint'>高频常用语可直接播报，也可载入修改</Text>
        </View>
      </View>

      {items.length ? (
        <ScrollView scrollX className='saved-phrases-scroll'>
          <View className='saved-phrases-list'>
            {items.map(item => (
              <View className='saved-phrase-card' key={item.sentence}>
                <View className='saved-phrase-card__images'>
                  {item.output.slice(0, 4).map((tile, index) => (
                    <PictogramImage
                      className='saved-phrase-card__image'
                      key={`${tile.id}-${index}`}
                      src={tile.image}
                      label={tile.label}
                      mediaType={tile.mediaType}
                      video={tile.video}
                    />
                  ))}
                </View>
                <Text className='saved-phrase-card__sentence'>{item.sentence}</Text>
                <View className='saved-phrase-card__actions'>
                  <Button
                    className='saved-phrase-card__play'
                    onClick={() => void onPlay(item)}
                  >
                    一键播报
                  </Button>
                  <Button
                    className='saved-phrase-card__reuse'
                    onClick={() => onReuse(item)}
                  >
                    载入修改
                  </Button>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text className='saved-phrases-empty'>还没有常用语，可先选图并收藏一句。</Text>
      )}
    </View>
  )
}
