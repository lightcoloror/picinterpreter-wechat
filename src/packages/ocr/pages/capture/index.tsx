import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { taroImageTextRecognitionIntent } from '../../../../platform/taroImageTextRecognitionIntent'
import { taroImageTextRecognitionPort } from '../../taroImageTextRecognitionPort'
import './index.css'

export default function ImageTextRecognitionPage() {
  const [isWorking, setIsWorking] = useState(false)
  const [notice, setNotice] = useState(
    taroImageTextRecognitionPort.configured
      ? '请选择含有清晰文字的图片。'
      : '当前构建尚未配置图片识字 API，可返回继续手工输入。'
  )

  const recognizeImage = async () => {
    const confirmation = await Taro.showModal({
      title: '发送图片识字',
      content:
        '图片会发送给当前配置的识字供应商。图语家 API 仅在内存中转发，不保存原图；请勿上传身份证、病历等敏感材料。',
      confirmText: '同意并选图',
      cancelText: '取消'
    })
    if (!confirmation.confirm) return

    setIsWorking(true)
    setNotice('正在选择、压缩并识别图片，请稍候。')
    const result =
      await taroImageTextRecognitionPort.selectAndRecognize()
    setIsWorking(false)
    setNotice(result.message)
    if (!result.ok || !result.value) return

    const createdAt = Date.now()
    const saved = taroImageTextRecognitionIntent.save({
      id: `ocr-${createdAt}`,
      text: result.value.text,
      createdAt
    })
    if (!saved) {
      setNotice('识别成功，但文字暂时无法返回接收端。')
      return
    }

    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({
        url: '/packages/caregiver/pages/receiver/index'
      })
    )
  }

  return (
    <View className='ocr-page'>
      <View className='ocr-hero'>
        <Text className='ocr-hero__eyebrow'>照护者辅助输入</Text>
        <Text className='ocr-hero__title'>拍下文字，带回接收端修改</Text>
        <Text className='ocr-hero__description'>
          识别结果只会填入文字框，不会自动分词、配图、保存历史或发送给沟通对象。
        </Text>
      </View>

      <View className='ocr-card'>
        <Text className='ocr-card__index'>01</Text>
        <Text className='ocr-card__title'>选择图片</Text>
        <Text className='ocr-card__hint'>
          支持相机和相册中的 JPEG、PNG、WebP。图片超过 2 MiB 时会先在本机压缩一次。
        </Text>
        <Button
          id='ocr-select-button'
          className='ocr-primary'
          loading={isWorking}
          disabled={isWorking}
          onClick={() => {
            void recognizeImage()
          }}
        >
          {isWorking ? '识别中' : '确认隐私说明并选图'}
        </Button>
      </View>

      <View className='ocr-card ocr-card--privacy'>
        <Text className='ocr-card__index'>02</Text>
        <Text className='ocr-card__title'>隐私边界</Text>
        <Text className='ocr-card__hint'>
          图语家服务端不把原图写入文件、数据库或日志；上游识字供应商仍受其自身服务条款约束。
        </Text>
      </View>

      <View
        className={
          isWorking
            ? 'ocr-notice ocr-notice--working'
            : 'ocr-notice'
        }
        role='status'
      >
        <Text>{notice}</Text>
      </View>
      <Button
        className='ocr-back'
        disabled={isWorking}
        onClick={() => {
          void Taro.navigateBack({ delta: 1 })
        }}
      >
        返回手工输入
      </Button>
    </View>
  )
}
