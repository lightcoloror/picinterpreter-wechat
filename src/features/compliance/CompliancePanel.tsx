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
          title: '暂时无法打开隐私指引，请检查网络后重试；持续失败请联系支持人员',
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
        普通沟通历史按本机账号和患者档案分别保留最近 50 条，不上传云端。收藏独立保存，可按您的同步与共享设置在云端保存或供获授权成员使用。
      </Text>
      <Text className='compliance-panel__body'>
        开启患者资料云同步后，图卡、图板和沟通偏好会自动同步。使用在线 AI、语音识别、OCR 或在线补图时，本次提交的相关内容会发送到对应服务；不会自动附带过去的普通沟通历史。
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
