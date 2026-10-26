import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { filterSavedPhrasesByLifeContext, getCommunicationQuickPhrases } from '@cboard-communication-core/savedPhraseManagement'
import type { CommunicationSavedPhraseEntry } from '@cboard-communication-core/repository'
import { isCareSharedPhrase } from '@cboard-communication-core/careSharedPhrases'

import LifeContextFilter from './LifeContextFilter'
import PictogramImage from '../../components/PictogramImage'

interface SavedPhrasesPanelProps {
  items: CommunicationSavedPhraseEntry[]
  onReuse: (item: CommunicationSavedPhraseEntry) => void
  onPlay: (item: CommunicationSavedPhraseEntry) => Promise<void>
  onView: (item: CommunicationSavedPhraseEntry) => void
}

export default function SavedPhrasesPanel({
  items,
  onReuse,
  onPlay,
  onView
}: SavedPhrasesPanelProps) {
  const [lifeContext, setLifeContext] = useState<string | null>(null)
  const filtered = filterSavedPhrasesByLifeContext(items, lifeContext)
  const visible = [...getCommunicationQuickPhrases(filtered.filter(item => !isCareSharedPhrase(item)), 6), ...filtered.filter(isCareSharedPhrase)]
  return (
    <View className='panel saved-phrases-panel'>
      <View className='section-heading'>
        <Text className='section-heading__index'>常</Text>
        <View>
          <Text className='section-heading__title'>常用语</Text>
          <Text className='section-heading__hint'>高频常用语可直接播报，也可载入修改</Text>
        </View>
      </View>

      <LifeContextFilter items={items} value={lifeContext} onChange={setLifeContext} />
      <Button id='saved-phrases-view-all' onClick={() => void Taro.navigateTo({ url: '/packages/management/pages/index/index?view=phrases' +
        (lifeContext === null ? '' : `&lifeContext=${encodeURIComponent(lifeContext)}`) })}
      >查看全部（{filtered.length}）</Button>
      {visible.length ? (
        <ScrollView scrollX className='saved-phrases-scroll'>
          <View className='saved-phrases-list'>
            {visible.map(item => (
              <View className='saved-phrase-card' key={`${isCareSharedPhrase(item) ? 'shared' : 'own'}:${item.id || item.sentence}`}>
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
                {isCareSharedPhrase(item) && <Text>家庭共享</Text>}
                <View className='saved-phrase-card__actions'>
                  <Button onClick={() => onView(item)}>查看整句</Button>
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
        <Text className='saved-phrases-empty'>{items.length ? '这个情境还没有常用语，可在常用语管理中整理。' : '还没有常用语，可先选图并收藏一句。'}</Text>
      )}
    </View>
  )
}
