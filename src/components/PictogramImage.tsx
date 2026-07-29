import { useState } from 'react'
import { Image, Text, Video, View } from '@tarojs/components'

import { resolvePictogramImageViewState } from './pictogramImageState'
import './PictogramImage.css'

interface PictogramImageProps {
  className?: string
  src?: string
  label?: string
  mediaType?: 'image' | 'gif' | 'video'
  video?: string
  videoAutoplay?: boolean
  videoControls?: boolean
  videoLoop?: boolean
}

export default function PictogramImage({
  className = '',
  src,
  label,
  mediaType,
  video,
  videoAutoplay = false,
  videoControls = false,
  videoLoop = true
}: PictogramImageProps) {
  const [failedSource, setFailedSource] = useState('')
  const isVideo = mediaType === 'video' && Boolean(video)
  const shouldRenderVideo =
    isVideo && (videoAutoplay || videoControls)
  const state = resolvePictogramImageViewState(
    shouldRenderVideo ? video : src,
    failedSource,
    label
  )

  if (state.showFallback) {
    return (
      <View
        className={`${className} pictogram-image-fallback ${
          state.canRetry ? 'pictogram-image-fallback--retryable' : ''
        }`.trim()}
        ariaRole={state.canRetry ? 'button' : 'img'}
        ariaLabel={`${state.fallbackLabel}，${
          shouldRenderVideo ? '视频' : '图片'
        }暂时无法显示${
          state.canRetry ? '，点按重试' : ''
        }`}
        onClick={
          state.canRetry ? () => setFailedSource('') : undefined
        }
      >
        <Text className='pictogram-image-fallback__text'>
          {state.fallbackLabel}
        </Text>
        {state.canRetry && (
          <Text className='pictogram-image-fallback__retry'>点按重试</Text>
        )}
      </View>
    )
  }

  if (shouldRenderVideo) {
    return (
      <Video
        className={className}
        src={state.source}
        poster={src}
        controls={videoControls}
        autoplay={videoAutoplay}
        loop={videoLoop}
        muted
        objectFit='contain'
        showFullscreenBtn={videoControls}
        showCenterPlayBtn={videoControls}
        title={label || '沟通动作视频'}
        onError={() => setFailedSource(state.source)}
      />
    )
  }

  return (
    <Image
      className={className}
      src={state.source}
      mode='aspectFit'
      ariaLabel={label ? `图片：${label}` : '沟通图片'}
      onError={() => setFailedSource(state.source)}
    />
  )
}
