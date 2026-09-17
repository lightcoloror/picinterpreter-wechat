import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { accountClosureMessage, type ClosurePreview, type ClosureStatus } from '@cboard-communication-core/accountClosure'
import { validatePrivateArchivePassphrase } from '@cboard-communication-core/privateArchivePassphrase'
import { createTaroAccountClosure } from './taroAccountClosure'
import { taroCboardSessionStore } from '../../platform/taroCboardAccountPort'
import type { ClosureRecoveryEntry } from '../../platform/accountClosureRecoveryClient'

export default function AccountClosurePanel({ buildArchive }: { buildArchive(): Promise<Uint8Array> }) {
  const [client] = useState(() => createTaroAccountClosure(buildArchive))
  const [preview, setPreview] = useState<ClosurePreview | null>(null)
  const [status, setStatus] = useState<ClosureStatus | null>(null)
  const [entries, setEntries] = useState<ClosureRecoveryEntry[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const mounted = useRef(true)
  const owner = taroCboardSessionStore.load()?.user.id
  async function refresh() {
    const local = await client.recoveries()
    if (!mounted.current) return
    setEntries(local)
    const remote = await client.status()
    if (mounted.current) setStatus(remote)
  }
  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true; setBusy(true); setNotice('')
    try { await action() }
    catch (error) { if (mounted.current) setNotice(accountClosureMessage(error)) }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }
  useEffect(() => { void run(refresh); return () => { mounted.current = false } }, [])
  const confirm = () => run(async () => {
    if (!preview?.canConfirm || confirmation !== 'delete-account' || !owner || preview.owner !== owner) return
    const answer = await Taro.showModal({ title: '确认关闭家庭并注销账号',
      content: `将关闭 ${preview.familyIds.length} 个家庭，删除其云端资料及账号，操作不可撤销。本机已保存且可读取的资料会先生成恢复副本；这不是完整云端备份。`,
      confirmText: '确认注销', confirmColor: '#b91c1c', cancelText: '取消' })
    if (!answer.confirm || !mounted.current) return
    const result = await client.confirm(preview)
    if (!mounted.current) return
    setStatus(result); setPreview(null); setConfirmation('')
    const local = await client.recoveries()
    if (!mounted.current) return
    setEntries(local)
    if (result.status === 'confirmed' && client.isCurrentAccount(owner)) {
      await Taro.showModal({ title: '注销已受理', showCancel: false,
        content: '云端清理仍在进行。退出后可从本机备份页面查询进度和导出加密恢复文件。' })
      if (client.isCurrentAccount(owner)) taroCboardSessionStore.clear()
    }
  })
  return <View className='library-backup-card'>
    <Text className='library-backup-card__title'>账号注销与本机恢复</Text>
    <Text>注销前明确确认关闭家庭和云端删除范围。恢复副本仅含本机可读取且允许导出的资料，不包含登录身份或成员授权；受邀协作的其他家庭缓存不转为离线副本。</Text>
    {owner && status?.status !== 'confirmed' && <Button disabled={busy} onClick={() => void run(async () => {
      const result = await client.preview()
      if (mounted.current) { setPreview(result); setConfirmation('') }
    })}>查看注销影响范围</Button>}
    <Button disabled={busy} onClick={() => void run(refresh)}>查询注销进度</Button>
    {preview && <View>
      <Text>将关闭 {preview.familyIds.length} 个家庭；患者档案 {preview.families.reduce((n, f) => n + f.profileCount, 0)} 个。</Text>
      {preview.families.map(f => <Text key={f.familyId}>家庭 {f.familyId}：{f.profileCount} 个档案</Text>)}
      {!preview.canConfirm ? <Text>仍有成员或管理关系需要交接，请处理后重新查看。</Text> : <View>
        <Text>请输入 delete-account，再确认不可撤销的云端删除。</Text>
        <Input aria-label='注销确认文字' value={confirmation} onInput={e => setConfirmation(e.detail.value)} />
        <Button disabled={busy || confirmation !== 'delete-account'} onClick={() => void confirm()}>继续确认注销</Button>
      </View>}
    </View>}
    {status && <Text>{status.accountDeleted ? '云端账号清理已完成。' : status.status === 'confirmed' ? '已受理，云端清理仍在进行。' : status.confirmationUnknown ? '提交结果尚不明确，请查询进度，不要重复提交。' : '尚未确认注销。'}</Text>}
    {!!entries.length && <View>
      <Text>恢复副本仍在本机。请设置至少12个字符的恢复密码并妥善保存，然后导出加密文件。</Text>
      <Input password aria-label='恢复文件密码' value={password} onInput={e => setPassword(e.detail.value)} />
      {entries.map(entry => <Button key={entry.id} disabled={busy || !validatePrivateArchivePassphrase(password).ok}
        onClick={() => void run(async () => { await client.downloadRecovery(entry.id, password); if (mounted.current) setNotice('恢复文件已生成，请保存到安全位置。') })}>导出{entry.label}</Button>)}
    </View>}
    {!!notice && <Text>{notice}</Text>}
  </View>
}
