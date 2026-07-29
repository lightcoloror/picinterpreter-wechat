import { useState } from 'react'
import { Button, Picker, Text, View } from '@tarojs/components'
import type {
  CommunicationCandidateAutoplayDelay,
  CommunicationFontSize,
  CommunicationPreferences
} from '@cboard-communication-core/communicationPreferences'
import type {
  CommunicationServiceReadiness
} from '@cboard-communication-core/serviceReadiness'
import type { BoardDTO } from '@cboard-communication-core/dto'
import { getBoardDTOTilesInDisplayOrder } from '@cboard-communication-core/dto'
import {
  COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS,
  toggleCommunicationBoardVisibility
} from '@cboard-communication-core/communicationPreferences'
import {
  getPictogramTileKey,
  sortPictogramsForDisplay,
  type PictogramOrderingState
} from '@cboard-communication-core/pictogramOrdering'
import type {
  CboardAccountSession,
  CboardApiResult,
  CboardPhoneVerificationChallenge,
  CboardPhoneVerificationConfiguration,
  CboardPhoneVerificationConfirmation,
  CboardPhoneVerificationPurpose
} from '../../platform/cboardAccountPort'
import AccountSyncPanel from './AccountSyncPanel'
import PictogramImage from '../../components/PictogramImage'
import { resolveSpeechVoiceSelection } from './speechVoiceCatalog'
import './CommunicationSettings.css'

interface CommunicationSettingsPanelProps {
  boards: BoardDTO[]
  value: CommunicationPreferences
  pictogramOrdering: PictogramOrderingState
  accountConfigured: boolean
  accountSession: CboardAccountSession | null
  accountBusy: boolean
  accountNotice: string
  serviceConfigured: boolean
  serviceReadiness: CommunicationServiceReadiness | null
  serviceBusy: boolean
  serviceNotice: string
  aiConfigured: boolean
  aiBusy: boolean
  aiNotice: string
  aiTestBusy: boolean
  aiTestNotice: string
  speechVoiceDefault: string
  speechVoices: string[]
  speechPreviewBusy: boolean
  speechPreviewNotice: string
  onChange: (value: CommunicationPreferences) => void
  onMovePictogram: (
    boardId: string,
    tileId: string,
    direction: 'up' | 'down'
  ) => void
  onAccountLogin: (input: {
    email: string
    password: string
  }) => Promise<boolean>
  onAccountPhoneLogin: (input: {
    phone: string
    phoneVerificationToken: string
  }) => Promise<boolean>
  onGetPhoneVerificationConfiguration: () => Promise<
    CboardApiResult<CboardPhoneVerificationConfiguration>
  >
  onRequestPhoneVerification: (input: {
    phone: string
    purpose?: CboardPhoneVerificationPurpose
  }) => Promise<CboardApiResult<CboardPhoneVerificationChallenge>>
  onConfirmPhoneVerification: (input: {
    challengeId: string
    phone: string
    code: string
    purpose?: CboardPhoneVerificationPurpose
  }) => Promise<CboardApiResult<CboardPhoneVerificationConfirmation>>
  onAccountRegister: (input: {
    name: string
    email: string
    phone: string
    password: string
    phoneVerificationToken?: string
  }) => Promise<boolean>
  onAccountRequestPasswordReset: (input: {
    email: string
  }) => Promise<boolean>
  onAccountResetPasswordWithPhone: (input: {
    phone: string
    phoneVerificationToken: string
    password: string
  }) => Promise<boolean>
  onAccountDelete: () => Promise<boolean>
  onAccountLogout: () => void
  onAccountSync: () => Promise<void>
  onAccountUpload: () => Promise<void>
  onCheckService: () => Promise<void>
  onCheckAi: () => Promise<void>
  onTestAi: () => Promise<void>
  onPreviewSpeechVoice: (voice: string) => Promise<void>
  onOpenPictureLibraryManagement: () => void
  onOpenPictureLibraryBackup: () => void
  onReplayOnboarding: () => void
}

const FONT_OPTIONS: Array<{ value: CommunicationFontSize; label: string }> = [
  { value: 'normal', label: '正常' },
  { value: 'large', label: '大' },
  { value: 'extra-large', label: '超大' }
]

const CANDIDATE_AUTOPLAY_LABELS: Record<
  CommunicationCandidateAutoplayDelay,
  string
> = {
  0: '关闭',
  5: '5 秒',
  10: '10 秒',
  15: '15 秒',
  30: '30 秒'
}

export default function CommunicationSettingsPanel({
  boards,
  value,
  pictogramOrdering,
  accountConfigured,
  accountSession,
  accountBusy,
  accountNotice,
  serviceConfigured,
  serviceReadiness,
  serviceBusy,
  serviceNotice,
  aiConfigured,
  aiBusy,
  aiNotice,
  aiTestBusy,
  aiTestNotice,
  speechVoiceDefault,
  speechVoices,
  speechPreviewBusy,
  speechPreviewNotice,
  onChange,
  onMovePictogram,
  onAccountLogin,
  onAccountPhoneLogin,
  onAccountRegister,
  onGetPhoneVerificationConfiguration,
  onRequestPhoneVerification,
  onConfirmPhoneVerification,
  onAccountRequestPasswordReset,
  onAccountResetPasswordWithPhone,
  onAccountDelete,
  onAccountLogout,
  onAccountSync,
  onAccountUpload,
  onCheckService,
  onCheckAi,
  onTestAi,
  onPreviewSpeechVoice,
  onOpenPictureLibraryManagement,
  onOpenPictureLibraryBackup,
  onReplayOnboarding
}: CommunicationSettingsPanelProps) {
  const patch = (changes: Partial<CommunicationPreferences>) =>
    onChange({ ...value, ...changes })
  const [orderingBoardId, setOrderingBoardId] = useState(
    boards.length ? boards[0].id : ''
  )
  const orderingBoard =
    boards.find(board => board.id === orderingBoardId) || boards[0]
  const orderingBoardIndex = Math.max(
    0,
    boards.findIndex(board => orderingBoard && board.id === orderingBoard.id)
  )
  const manualPictograms = orderingBoard
    ? sortPictogramsForDisplay(
        getBoardDTOTilesInDisplayOrder(orderingBoard),
        'manual',
        pictogramOrdering,
        orderingBoard.id
      ).filter(tile => !tile.loadBoardId)
    : []
  const speechVoiceSelection = resolveSpeechVoiceSelection(
    value.speechVoice,
    speechVoiceDefault,
    speechVoices
  )

  return (
    <View className='panel communication-settings-panel'>
      <View className='section-heading'>
        <Text className='section-heading__index'>设</Text>
        <View>
          <Text className='section-heading__title'>照护设置</Text>
          <Text className='section-heading__hint'>显示偏好只保存在当前设备</Text>
        </View>
      </View>

      <AccountSyncPanel
        configured={accountConfigured}
        session={accountSession}
        busy={accountBusy}
        notice={accountNotice}
        onLogin={onAccountLogin}
        onPhoneLogin={onAccountPhoneLogin}
        onRegister={onAccountRegister}
        onGetPhoneVerificationConfiguration={
          onGetPhoneVerificationConfiguration
        }
        onRequestPhoneVerification={onRequestPhoneVerification}
        onConfirmPhoneVerification={onConfirmPhoneVerification}
        onRequestPasswordReset={onAccountRequestPasswordReset}
        onResetPasswordWithPhone={onAccountResetPasswordWithPhone}
        onDeleteAccount={onAccountDelete}
        onLogout={onAccountLogout}
        onSync={onAccountSync}
        onUpload={onAccountUpload}
      />

      <View className='settings-row settings-row--stack service-readiness'>
        <Text className='settings-row__label'>CBoard 云端服务</Text>
        <Text className='settings-row__hint'>
          只读取公开健康状态，不发送患者文字、图片、账号令牌或沟通历史。离线图板不依赖此检查。
        </Text>
        <Text
          id='service-readiness-configuration'
          className={
            serviceConfigured
              ? 'ai-health__configuration ai-health__configuration--ready'
              : 'ai-health__configuration'
          }
        >
          {serviceConfigured
            ? '已配置 cboard-api 地址，尚需检测运行状态。'
            : '尚未配置手机可访问的 HTTPS cboard-api。'}
        </Text>
        {serviceReadiness && (
          <View id='service-readiness-details' className='service-readiness__details'>
            <Text>
              API：{serviceReadiness.ready ? '已就绪' : '降级'}
            </Text>
            <Text>
              数据库：{serviceReadiness.database === 'connected' ? '已连接' : '未连接'}
            </Text>
            <Text>
              通信索引：{
                serviceReadiness.communicationIndexes === 'ready'
                  ? '已就绪'
                  : serviceReadiness.communicationIndexes === 'building'
                    ? '建立中'
                    : '未就绪'
              }
            </Text>
            <Text>
              账号私有图库：{
                serviceReadiness.privatePictureLibrary === 'configured'
                  ? '已配置'
                  : '未配置'
              }
            </Text>
          </View>
        )}
        <Button
          id='service-readiness-check-button'
          className='review-action'
          disabled={serviceBusy}
          onClick={onCheckService}
        >
          {serviceBusy ? '检测中...' : '检测云端基础服务'}
        </Button>
        {serviceNotice && (
          <Text id='service-readiness-notice' className='ai-health__notice'>
            {serviceNotice}
          </Text>
        )}
      </View>

      <View className='settings-row settings-row--stack picture-library-entry'>
        <Text className='settings-row__label'>图片库维护</Text>
        <Text className='settings-row__hint'>
          家属可跨分类查找默认图卡，为患者更换熟悉照片、编辑图片说明，或恢复 CBoard 默认图片。
        </Text>
        <Button
          id='open-picture-library-management-button'
          className='review-action picture-library-entry__button'
          onClick={onOpenPictureLibraryManagement}
        >
          打开图片库维护
        </Button>
      </View>

      <View className='settings-row settings-row--stack picture-library-entry'>
        <Text className='settings-row__label'>图库备份与恢复</Text>
        <Text className='settings-row__hint'>
          将个人熟悉图片或完整图库导出为 ZIP，也可在新设备恢复标签、同义词、分类、顺序和使用次数。
        </Text>
        <Button
          id='open-picture-library-backup-button'
          className='review-action picture-library-entry__button'
          onClick={onOpenPictureLibraryBackup}
        >
          打开图库备份
        </Button>
      </View>

      <View className='settings-row settings-row--stack ai-health'>
        <Text className='settings-row__label'>可选增强服务</Text>
        <Text className='settings-row__hint'>
          检测候选句、分词、图片识字、图卡建议、粤语录音识别、图片去背景和服务端后备朗读。任何增强失败都不影响本地图板和手工沟通。
        </Text>
        <Text
          id='ai-health-configuration'
          className={
            aiConfigured
              ? 'ai-health__configuration ai-health__configuration--ready'
              : 'ai-health__configuration'
          }
        >
          {aiConfigured
            ? '已配置 cboard-api，登录后可检测模型连接。'
            : '尚未配置手机可访问的 HTTPS cboard-api。'}
        </Text>
        <Button
          id='ai-health-check-button'
          className='review-action'
          disabled={aiBusy}
          onClick={onCheckAi}
        >
          {aiBusy ? '检测中...' : '检测增强服务'}
        </Button>
        {aiNotice && (
          <Text id='ai-health-notice' className='ai-health__notice'>
            {aiNotice}
          </Text>
        )}
        <Text className='settings-row__hint'>
          真实测试只发送固定词语“我、喝水”，不发送患者文字、图片、历史或场景。成功会消耗一次增强额度并计入 Token 用量。
        </Text>
        <Button
          id='ai-live-test-button'
          className='review-action'
          disabled={aiTestBusy || !aiConfigured || !accountSession}
          onClick={onTestAi}
        >
          {aiTestBusy ? '真实连接测试中...' : '测试真实 AI 连接'}
        </Button>
        {aiTestNotice && (
          <Text id='ai-live-test-notice' className='ai-health__notice'>
            {aiTestNotice}
          </Text>
        )}
      </View>

      <View className='settings-row settings-row--stack speech-voice-settings'>
        <Text className='settings-row__label'>服务端后备音色</Text>
        <Text className='settings-row__hint'>
          只在 WechatSI 失败后的服务端朗读中使用。先登录并检测增强服务，再选择服务器公开的音色；患者文字不会因选择音色而保存。
        </Text>
        {speechVoiceSelection.options.length ? (
          <>
            <View className='settings-options speech-voice-options'>
              {speechVoiceSelection.options.map((option, index) => (
                <Button
                  id={'speech-voice-option-' + index}
                  className={
                    speechVoiceSelection.selectedVoice === option.id
                      ? 'review-action settings-option--active speech-voice-option'
                      : 'review-action speech-voice-option'
                  }
                  key={option.id}
                  onClick={() =>
                    patch({
                      speechVoice: option.isDefault ? '' : option.id
                    })
                  }
                >
                  <Text className='speech-voice-option__label'>
                    {option.label}{option.isDefault ? ' · 默认' : ''}
                  </Text>
                  <Text className='speech-voice-option__description'>
                    {option.description}
                  </Text>
                </Button>
              ))}
            </View>
            <Button
              id='speech-voice-preview-button'
              className='review-action speech-voice-preview'
              disabled={!accountSession}
              onClick={() =>
                void onPreviewSpeechVoice(
                  speechVoiceSelection.selectedVoice
                )
              }
            >
              {speechPreviewBusy ? '停止试听' : '试听所选后备音色'}
            </Button>
          </>
        ) : (
          <Text className='speech-voice-empty'>
            尚未取得音色清单，请先登录并点击“检测增强服务”。
          </Text>
        )}
        {speechPreviewNotice && (
          <Text id='speech-voice-preview-notice' className='ai-health__notice'>
            {speechPreviewNotice}
          </Text>
        )}
      </View>

      <View className='settings-row'>
        <Text className='settings-row__label'>高对比度</Text>
        <Button
          id='accessibility-high-contrast-toggle'
          className='review-action'
          onClick={() => patch({ highContrast: !value.highContrast })}
        >
          {value.highContrast ? '已开启' : '未开启'}
        </Button>
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>字体大小</Text>
        <View className='settings-options'>
          {FONT_OPTIONS.map(option => (
            <Button
              id={`accessibility-font-${option.value}`}
              className={value.fontSize === option.value ? 'review-action settings-option--active' : 'review-action'}
              key={option.value}
              onClick={() => patch({ fontSize: option.value })}
            >{option.label}</Button>
          ))}
        </View>
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>每行图卡</Text>
        <View className='settings-options'>
          {[2, 3, 4].map(columns => (
            <Button
              id={`accessibility-grid-${columns}`}
              className={value.gridColumns === columns ? 'review-action settings-option--active' : 'review-action'}
              key={columns}
              onClick={() => patch({ gridColumns: columns as 2 | 3 | 4 })}
            >{columns} 列</Button>
          ))}
        </View>
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>朗读语速</Text>
        <View className='settings-options'>
          {[0.7, 1, 1.3].map(rate => (
            <Button
              className={value.speechRate === rate ? 'review-action settings-option--active' : 'review-action'}
              key={rate}
              onClick={() => patch({ speechRate: rate })}
            >{rate === 1 ? '正常' : `${rate} 倍`}</Button>
          ))}
        </View>
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>图卡顺序</Text>
        <Text className='settings-row__hint'>
          固定顺序便于患者形成空间记忆；常用优先按患者实际成功点选次数排序，并在次数相同时保持人工顺序。
        </Text>
        <View className='settings-options'>
          {[
            { value: 'manual' as const, label: '固定顺序' },
            { value: 'popularity' as const, label: '常用优先' }
          ].map(option => (
            <Button
              id={`pictogram-sort-${option.value}`}
              className={
                value.pictogramSortMode === option.value
                  ? 'review-action settings-option--active'
                  : 'review-action'
              }
              key={option.value}
              onClick={() => patch({ pictogramSortMode: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </View>

        {orderingBoard && (
          <View className='manual-order'>
            <Picker
              mode='selector'
              range={boards.map(board => board.name)}
              value={orderingBoardIndex}
              onChange={event => {
                const nextBoard = boards[Number(event.detail.value)]
                if (nextBoard) setOrderingBoardId(nextBoard.id)
              }}
            >
              <View className='manual-order__picker'>
                调整板块：{orderingBoard.name}
              </View>
            </Picker>
            {value.pictogramSortMode === 'popularity' && (
              <Text className='manual-order__notice'>
                当前患者侧按常用优先显示；切回固定顺序后会恢复下面的人工顺序。
              </Text>
            )}
            <View className='manual-order__list'>
              {manualPictograms.map((tile, index) => {
                const usageKey = getPictogramTileKey(
                  orderingBoard.id,
                  tile.id
                )
                const usageRecord =
                  pictogramOrdering.usageByTileKey[usageKey]
                return (
                  <View className='manual-order__item' key={tile.id}>
                    <PictogramImage
                      className='manual-order__image'
                      src={tile.image}
                      label={tile.label}
                      mediaType={tile.mediaType}
                      video={tile.video}
                    />
                    <View className='manual-order__copy'>
                      <Text className='manual-order__label'>{tile.label}</Text>
                      <Text className='manual-order__usage'>
                        第 {index + 1} 位 · 已使用 {usageRecord ? usageRecord.count : 0} 次
                      </Text>
                    </View>
                    <View className='manual-order__actions'>
                      <Button
                        id={`manual-order-up-${tile.id}`}
                        className='review-action manual-order__action'
                        disabled={index === 0}
                        onClick={() =>
                          onMovePictogram(orderingBoard.id, tile.id, 'up')
                        }
                      >
                        上移
                      </Button>
                      <Button
                        id={`manual-order-down-${tile.id}`}
                        className='review-action manual-order__action'
                        disabled={index === manualPictograms.length - 1}
                        onClick={() =>
                          onMovePictogram(orderingBoard.id, tile.id, 'down')
                        }
                      >
                        下移
                      </Button>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>候选句自动播报</Text>
        <Text className='settings-row__hint'>
          默认 15 秒无操作后依次播报全部候选句。触摸、滚动、选择单句或点击停止都会取消当前计时和播报。
        </Text>
        <View className='settings-options'>
          {COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS.map(delay => (
            <Button
              id={`candidate-autoplay-delay-${delay}`}
              className={
                value.candidateAutoplayDelaySeconds === delay
                  ? 'review-action settings-option--active'
                  : 'review-action'
              }
              key={delay}
              onClick={() =>
                patch({ candidateAutoplayDelaySeconds: delay })
              }
            >
              {CANDIDATE_AUTOPLAY_LABELS[delay]}
            </Button>
          ))}
        </View>
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>缺词自动联网找图</Text>
        <Text className='settings-row__hint'>
          开启后只发送缺词，不发送完整原句；cboard-api 依次使用 ARASAAC 和 OpenSymbols，服务不可用时再尝试 ARASAAC 直连。候选必须由照护者确认后才保存。
        </Text>
        <Button
          id='online-pictogram-search-toggle'
          className={
            value.onlinePictogramSearchEnabled
              ? 'review-action settings-option--active'
              : 'review-action'
          }
          onClick={() =>
            patch({
              onlinePictogramSearchEnabled:
                !value.onlinePictogramSearchEnabled
            })
          }
        >
          {value.onlinePictogramSearchEnabled ? '已开启' : '已关闭'}
        </Button>
      </View>

      <View className='settings-row settings-row--stack'>
        <Text className='settings-row__label'>隐藏不常用板块</Text>
        <View className='settings-options settings-options--boards'>
          {boards.map(board => {
            const hidden = value.hiddenBoardIds.includes(board.id)
            return (
              <Button
                className={hidden ? 'review-action settings-option--hidden' : 'review-action'}
                key={board.id}
                onClick={() => onChange(toggleCommunicationBoardVisibility(value, board.id))}
              >{hidden ? `恢复 ${board.name}` : `隐藏 ${board.name}`}</Button>
            )
          })}
        </View>
      </View>

      <Button
        id='replay-communication-onboarding-button'
        className='button button--outline'
        onClick={onReplayOnboarding}
      >
        重新查看使用引导
      </Button>
    </View>
  )
}
