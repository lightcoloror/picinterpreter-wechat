import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import './CompliancePanel.css'

const sourceCodeUrl =
  String(process.env.TARO_APP_SOURCE_CODE_URL || '').trim()

export default function CompliancePanel() {
  const openPrivacyContract = () => {
    Taro.openPrivacyContract({
      fail: () => {
        void Taro.showToast({
          title: '公众平台尚未配置隐私保护指引',
          icon: 'none'
        })
      }
    })
  }

  const copySourceCodeUrl = () => {
    if (!sourceCodeUrl) {
      void Taro.showToast({
        title: '正式发布前必须配置公开源码地址',
        icon: 'none'
      })
      return
    }
    void Taro.setClipboardData({ data: sourceCodeUrl })
  }

  return (
    <View className='compliance-panel'>
      <Text className='compliance-panel__eyebrow'>
        隐私、开源与第三方素材
      </Text>
      <Text className='compliance-panel__title'>了解数据去向</Text>
      <Text className='compliance-panel__body'>
        图卡、常用语和沟通记录默认保存在本机；只有您主动登录、同步、使用 AI、OCR、方言识别或在线补图时，相关数据才会发送到已说明的服务。
      </Text>
      <Text className='compliance-panel__body'>
        程序代码采用 GPLv3；内置图符分别遵循 Mulberry、ARASAAC 和 CBoard 原始许可，在线候选采用前会显示来源并由照护者确认。
      </Text>
      {!sourceCodeUrl && (
        <Text className='compliance-panel__warning'>
          当前构建尚未配置公众可访问的源码地址，不可作为正式公开发布版本。
        </Text>
      )}
      <View className='compliance-panel__actions'>
        <Button
          className='compliance-panel__button'
          onClick={openPrivacyContract}
        >
          查看隐私保护指引
        </Button>
        <Button
          className='compliance-panel__button'
          onClick={copySourceCodeUrl}
        >
          {sourceCodeUrl ? '复制源码地址' : '源码尚未公开'}
        </Button>
      </View>
    </View>
  )
}
