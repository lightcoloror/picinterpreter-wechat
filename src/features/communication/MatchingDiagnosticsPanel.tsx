import { useState } from 'react'
import { Button, Text, Textarea, View } from '@tarojs/components'
import type { BoardDTO } from '@cboard-communication-core/dto'
import type {
  ReceiverCorrectionMemory
} from '@cboard-communication-core/correctionMemory'
import {
  COMMUNICATION_MATCHING_DIAGNOSTIC_EXAMPLES,
  COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH,
  analyzeCommunicationMatching,
  type CommunicationMatchingDiagnosticResult
} from '@cboard-communication-core/matchingDiagnostics'

import PictogramImage from '../../components/PictogramImage'
import './MatchingDiagnostics.css'

interface MatchingDiagnosticsPanelProps {
  boards: BoardDTO[]
  correctionMemory?: ReceiverCorrectionMemory
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: '精确',
  synonym: '同义词',
  'lexicon-synonym': '词库归一',
  partial: '包含匹配',
  corrected: '修正记忆',
  none: '未匹配'
}

export default function MatchingDiagnosticsPanel({
  boards,
  correctionMemory
}: MatchingDiagnosticsPanelProps) {
  const [input, setInput] = useState('')
  const [result, setResult] =
    useState<CommunicationMatchingDiagnosticResult | null>(null)
  const [notice, setNotice] = useState(
    '只读检查，不会写入沟通历史、缺词队列或云端。'
  )

  const run = (value = input) => {
    const next = analyzeCommunicationMatching(value, boards, {
      correctionMemory
    })
    setInput(next.inputText)
    setResult(next)
    setNotice(
      next.totalCount
        ? '诊断完成，结果使用当前接收端规则。'
        : '请先输入需要检查的文字。'
    )
  }

  return (
    <View className='panel matching-diagnostics'>
      <View className='section-heading'>
        <Text className='section-heading__index'>诊</Text>
        <View>
          <Text className='section-heading__title'>图文匹配诊断</Text>
          <Text className='section-heading__hint'>
            查看真实分词、图片命中类型和仍需补图的词
          </Text>
        </View>
      </View>

      <Text className='matching-diagnostics__notice'>{notice}</Text>
      <Textarea
        className='matching-diagnostics__input'
        value={input}
        maxlength={COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH}
        placeholder='输入一句话，例如：我想喝水'
        autoHeight
        onInput={event => setInput(event.detail.value)}
      />
      <Button
        id='run-matching-diagnostics-button'
        className='button button--primary matching-diagnostics__run'
        onClick={() => run()}
      >
        开始诊断
      </Button>

      <View className='matching-diagnostics__examples'>
        {COMMUNICATION_MATCHING_DIAGNOSTIC_EXAMPLES.map(example => (
          <Button
            className='matching-diagnostics__example'
            key={example}
            onClick={() => run(example)}
          >
            {example}
          </Button>
        ))}
      </View>

      {result && result.totalCount > 0 && (
        <View className='matching-diagnostics__result'>
          <View className='matching-diagnostics__summary'>
            <Text className='matching-diagnostics__summary-title'>
              命中 {result.matchedCount} / {result.totalCount}
            </Text>
            <Text className='matching-diagnostics__summary-detail'>
              匹配率 {Math.round(result.matchRate * 100)}% ·
              分词 {result.segmentation.engine} ·
              耗时 {result.elapsedMs} ms
            </Text>
          </View>

          <View className='matching-diagnostics__grid'>
            {result.items.map((item, index) => (
              <View
                className='matching-diagnostics__item'
                key={`${item.token}-${index}`}
              >
                {item.matched ? (
                  <PictogramImage
                    className='matching-diagnostics__image'
                    src={item.image}
                    label={item.label}
                  />
                ) : (
                  <View
                    className='matching-diagnostics__missing-image'
                    ariaRole='img'
                    ariaLabel={`${item.token} 未匹配`}
                  >
                    <Text>?</Text>
                  </View>
                )}
                <Text className='matching-diagnostics__token'>
                  {item.token}
                </Text>
                <Text className='matching-diagnostics__match'>
                  {item.matched ? item.label : '未匹配'} ·
                  {MATCH_TYPE_LABELS[item.matchType] || item.matchType}
                </Text>
              </View>
            ))}
          </View>

          {!!result.unmatchedTokens.length && (
            <Text className='matching-diagnostics__missing'>
              缺词：{result.unmatchedTokens.join('、')}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
