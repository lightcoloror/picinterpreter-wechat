import { useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'

import './index.css'
import { runtime } from '../../platform/taroCareRuntime'
import { currentCareContext, saveCareSelection, type CareSelection } from '../../platform/taroCareContext'
import { startCareWorkspace, synchronizeCareWorkspace } from '../../platform/taroCareWorkspace'
import { enterCareProfile } from '../../platform/careProfileEntry'

export default function LaunchPage() {
  const [notice, setNotice] = useState('正在打开患者表达图板')
  const [profiles, setProfiles] = useState<CareSelection[]>([])
  const generation = useRef(0)
  const entryAccount = useRef<string | undefined>()
  const currentRun = () => {
    const run = generation.current
    const accountId = entryAccount.current
    return () => generation.current === run && runtime.identity()?.id === accountId
  }
  useDidHide(() => { generation.current += 1 })

  async function enter(profile: CareSelection, role?: string) {
    if (!currentRun()()) return
    generation.current += 1
    const current = currentRun()
    try { await enterCareProfile(profile, {
      current, request: runtime.request, newId: runtime.newId,
      select: saveCareSelection, start: startCareWorkspace, sync: synchronizeCareWorkspace,
      needsRole: value => { setProfiles([value]); setNotice('选择此账号的使用身份') },
      navigate: value => Taro.redirectTo({ url: value.relationship?.defaultMode === 'receiver'
        ? '/packages/caregiver/pages/receiver/index' : '/packages/caregiver/pages/patient/index' })
    }, role) } catch (error: any) {
      if (current()) setNotice(error.message || '暂时无法进入患者档案')
    }
  }

  useDidShow(() => {
    generation.current += 1
    entryAccount.current = runtime.identity()?.id
    const current = currentRun()
    setProfiles([])
    if (runtime.enabled && !runtime.identity() && currentCareContext()?.accountId === 'offline') {
      startCareWorkspace()
      void synchronizeCareWorkspace().catch(() => undefined).then(async () => {
        if (current()) await Taro.redirectTo({ url: currentCareContext()?.selection?.relationship?.defaultMode === 'receiver'
          ? '/packages/caregiver/pages/receiver/index' : '/packages/caregiver/pages/patient/index' })
      })
      return
    }
    if (runtime.enabled && runtime.identity()) {
      void (async () => {
        try {
          const [list, context] = await Promise.all([runtime.request('/care/profiles', 'GET'), runtime.request('/care/context', 'GET')]) as [CareSelection[], { selectedProfileId: string | null }]
          if (!current()) return
          const selected = list.find(p => p.id === context.selectedProfileId)
          if (selected?.relationship) await enter(selected)
          else { setProfiles(list); setNotice(list.length ? '选择要使用的患者档案' : '请从设置创建档案或接受家庭邀请') }
        } catch (error: any) {
          if (!current()) return
          const cached = currentCareContext()?.selection
          if (!error.status && cached?.relationship) {
            startCareWorkspace()
            await synchronizeCareWorkspace().catch(() => undefined)
            if (!current()) return
            await Taro.redirectTo({ url: cached.relationship.defaultMode === 'receiver'
              ? '/packages/caregiver/pages/receiver/index' : '/packages/caregiver/pages/patient/index' })
          } else setNotice('暂时无法联网，请稍后重试或从设置登录')
        }
      })()
      return
    }
    void Taro.redirectTo({
      url: '/packages/caregiver/pages/patient/index'
    }).catch(() => {
      setNotice('暂时无法打开沟通图板，请关闭小程序后重试。')
    })
  })

  return (
    <View className='launch-page'>
      <View className='launch-page__mark'>图</View>
      <Text className='launch-page__title'>图语家</Text>
      <Text className='launch-page__notice'>{notice}</Text>
      {profiles.map(profile => <View key={profile.id}>
        <Text>{profile.name || '患者档案'}</Text>
        {profile.relationship ? <Button onClick={() => { void enter(profile).catch(e => setNotice(e.message)) }}>进入</Button> : <View>
          <Button onClick={() => { void enter(profile, 'patient').catch(e => setNotice(e.message)) }}>我是患者，进入表达</Button>
          <Button onClick={() => { void enter(profile, 'relative').catch(e => setNotice(e.message)) }}>我是家属或照护者，进入接收</Button>
        </View>}
      </View>)}
      {runtime.enabled && <Button onClick={() => { void Taro.navigateTo({ url: '/packages/management/pages/care/index' }) }}>⚙ 设置与家庭协作</Button>}
    </View>
  )
}
