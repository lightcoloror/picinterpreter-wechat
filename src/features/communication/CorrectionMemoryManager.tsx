import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import {
  buildCorrectionMemoryManagementRows,
  type ReceiverCorrectionMemory
} from '@cboard-communication-core/correctionMemory'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'
import type { BoardDTO } from '@cboard-communication-core/dto'

interface CorrectionMemoryManagerProps {
  boards: BoardDTO[]
  memory: ReceiverCorrectionMemory
  onForget: (token: string) => boolean
}

export default function CorrectionMemoryManager({
  boards,
  memory,
  onForget
}: CorrectionMemoryManagerProps) {
  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState('')
  const rows = buildCorrectionMemoryManagementRows(
    memory,
    buildCommunicationTileCatalog(boards)
  )

  const forget = (token: string) => {
    if (onForget(token)) {
      setNotice(`已停止记住“${token}”，纠错审计仍会保留。`)
      return
    }
    setNotice('这条修正记忆已经失效。')
  }

  return (
    <View
      className='panel correction-memory-manager'
      id='receiver-correction-memory-manager'
    >
      <View className='correction-memory-manager__heading'>
        <View>
          <Text className='correction-memory-manager__title'>本机修正记忆</Text>
          <Text className='correction-memory-manager__hint'>
            只影响当前工作区，不修改 CBoard 默认词典
          </Text>
        </View>
        <Button
          className='button button--quiet'
          id='receiver-correction-memory-toggle'
          onClick={() => setExpanded(current => !current)}
        >
          {expanded ? '收起' : `查看 ${rows.length} 条`}
        </Button>
      </View>

      {notice && (
        <Text className='correction-memory-manager__notice'>
          {notice}
        </Text>
      )}

      {expanded && (
        <View
          className='correction-memory-manager__list'
          id='receiver-correction-memory-list'
        >
          {rows.length ? (
            rows.map((row, index) => (
              <View
                className='correction-memory-manager__row'
                key={row.token}
              >
                <View className='correction-memory-manager__copy'>
                  <Text className='correction-memory-manager__token'>
                    {row.token}
                  </Text>
                  <Text className='correction-memory-manager__meta'>
                    {row.preferredLabel
                      ? `偏好图：${row.preferredLabel}`
                      : '没有偏好图'}
                  </Text>
                  <Text className='correction-memory-manager__meta'>
                    {row.blockedLabels.length
                      ? `已阻止：${row.blockedLabels.join(' / ')}`
                      : '没有阻止图片'}
                    {` · 换图确认 ${row.frequencyCount} 次`}
                  </Text>
                </View>
                <Button
                  className='missing-queue__action'
                  id={`receiver-correction-memory-forget-${index}`}
                  onClick={() => forget(row.token)}
                >
                  不再记住
                </Button>
              </View>
            ))
          ) : (
            <Text className='correction-memory-manager__empty'>
              当前工作区还没有正在生效的修正记忆。
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
