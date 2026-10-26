import { useEffect, useRef, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import type { TileDTO } from '@cboard-communication-core/dto'
import { imageAvailabilityMessage, type ImageAvailability } from '@cboard-communication-core/imageAvailability'
import { createImageRepairOperation, originalPublicImagePath } from '@cboard-communication-core/imageRepair'
import { currentImageOperationEpoch } from '@cboard-communication-core/imageOperationEpoch'
import { createDevicePrivatePictogramAttribution } from '@cboard-communication-core/pictogramAttribution'
import { verifyTaroLocalImage } from '../platform/taroLocalImageVerification'
import { taroPersonalImagePort } from '../platform/taroPersonalImagePort'
import { taroPictogramSearchPort } from '../platform/taroPictogramSearchPort'

export default function ImageRepairControls({ tile, operationKey, onAdopt, onChoose, onKeepText }: {
  tile: TileDTO; operationKey: string
  onAdopt: (tile: TileDTO) => unknown
  onChoose?: () => void; onKeepText?: () => void
}) {
  const key = JSON.stringify([operationKey, tile])
  const active = useRef(key); active.current = key
  const operation = useRef(createImageRepairOperation())
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImageAvailability>({ status: 'unverified' })
  const [checking, setChecking] = useState(true)
  const [candidate, setCandidate] = useState<{ tile: TileDTO; epoch: number } | null>(null)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true; const epoch = currentImageOperationEpoch()
    setCandidate(null); setResult({ status: 'unverified' }); setChecking(true); setNotice('')
    operation.current.cancel(); busyRef.current = false; setBusy(false)
    verifyTaroLocalImage(tile.image).then(value => {
      if (alive && active.current === key && epoch === currentImageOperationEpoch()) {
        setResult(value); setChecking(false)
      }
    }).catch(() => {
      if (alive && active.current === key && epoch === currentImageOperationEpoch()) {
        setResult({ status: 'check-failed' }); setChecking(false)
      }
    })
    return () => { alive = false; operation.current.cancel() }
  }, [key, retry])
  async function prepare(work: () => Promise<TileDTO>, action: string) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setNotice('')
    try {
      const value = await operation.current.prepare(key + action, work)
      if (value && active.current === key) setCandidate({ tile: value, epoch: currentImageOperationEpoch() })
    } catch (_) { if (active.current === key) setNotice('图片读取、下载或核验失败，未修改原内容，请重试。') }
    finally { if (active.current === key) { busyRef.current = false; setBusy(false) } }
  }
  async function adopt() {
    if (busyRef.current || !candidate) return
    if (candidate.epoch !== currentImageOperationEpoch()) { setCandidate(null); return }
    busyRef.current = true; setBusy(true)
    try {
      if (await onAdopt(candidate.tile) === false) throw new Error('not saved')
      if (active.current === key) { setCandidate(null); setNotice('当前图片修改已提交；其他记录保持不变。') }
    } catch (_) { if (active.current === key) setNotice('图片已准备，但记录保存失败。请重试确认，无需重新下载。') }
    finally { if (active.current === key) { busyRef.current = false; setBusy(false) } }
  }
  const path = originalPublicImagePath(tile)
  return <View className='image-repair-controls'>
    <Text className='image-repair-controls__status'>{checking ? '正在检查本机图片，尚未确认离线可用。' : imageAvailabilityMessage(result)}</Text>
    {result.status !== 'available' && <View className='image-repair-controls__actions'>
      <Button size='mini' disabled={busy || checking} onClick={() => {
        setResult({ status: 'unverified' }); setChecking(true)
        setRetry(value => value + 1)
      }}>重新检查</Button>
      {path && <Button size='mini' disabled={busy} onClick={() => prepare(async () => {
        const cached = await taroPictogramSearchPort.cache({
          ...tile, image: path, source: tile.pictogramAttribution
        } as any)
        if (!cached.ok || !cached.value) throw new Error('download failed')
        return { ...tile, image: cached.value.image }
      }, 'public')}>重新下载原图</Button>}
      {!path && !checking && <Text className='image-repair-controls__notice'>此图片没有可自动重新下载的公开素材标识，可从已有图卡或本机重新选择，也可保留文字。</Text>}
      {onChoose && <Button size='mini' disabled={busy} onClick={onChoose}>从已有图卡重新选择</Button>}
      <Button size='mini' disabled={busy} onClick={() => prepare(async () => {
        const selected = await taroPersonalImagePort.selectAndSave()
        if (!selected.ok || !selected.image) throw new Error('not selected')
        return { ...tile, image: selected.image,
          pictogramAttribution: createDevicePrivatePictogramAttribution({ boardId: tile.boardId, tileId: tile.id, label: tile.label }) }
      }, 'private')}>重新选择本机图片</Button>
      {onKeepText && <Button size='mini' disabled={busy} onClick={onKeepText}>保留文字</Button>}
    </View>}
    {candidate && <View className='image-repair-controls__candidate'>
      <Image style={{ width: '96px', height: '96px' }} src={candidate.tile.image} mode='aspectFit' />
      <Text>只修改当前内容，请核对图片后确认。</Text>
      <Button size='mini' disabled={busy} onClick={adopt}>确认采用修复图片</Button>
      <Button size='mini' onClick={() => { operation.current.cancel(); setCandidate(null); setNotice('已取消，原图片不变。') }}>取消修复</Button>
    </View>}
    {notice && <Text className='image-repair-controls__notice'>{notice}</Text>}
  </View>
}
