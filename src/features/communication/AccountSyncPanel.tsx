import { useEffect, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'

import {
  isValidMainlandChinaPhone,
  normalizeMainlandChinaPhone
} from '@cboard-communication-core/accountPhone'
import {
  hasMatchingPhoneVerification
} from '@cboard-communication-core/accountPhoneVerification'
import type {
  CboardAccountSession,
  CboardApiResult,
  CboardPhoneVerificationChallenge,
  CboardPhoneVerificationConfiguration,
  CboardPhoneVerificationConfirmation,
  CboardPhoneVerificationPurpose
} from '../../platform/cboardAccountPort'
import {
  ACCOUNT_DELETE_CONFIRMATION_TEXT,
  isAccountDeletionConfirmation
} from '../../platform/accountDeletion'

interface AccountSyncPanelProps {
  configured: boolean
  session: CboardAccountSession | null
  busy: boolean
  notice: string
  onLogin: (input: {
    email: string
    password: string
  }) => Promise<boolean>
  onPhoneLogin: (input: {
    phone: string
    phoneVerificationToken: string
  }) => Promise<boolean>
  onRegister: (input: {
    name: string
    email: string
    phone: string
    password: string
    phoneVerificationToken?: string
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
  onRequestPasswordReset: (input: {
    email: string
  }) => Promise<boolean>
  onResetPasswordWithPhone: (input: {
    phone: string
    phoneVerificationToken: string
    password: string
  }) => Promise<boolean>
  onDeleteAccount: () => Promise<boolean>
  onLogout: () => void
  onSync: () => Promise<void>
  onUpload: () => Promise<void>
}

export default function AccountSyncPanel({
  configured,
  session,
  busy,
  notice,
  onLogin,
  onPhoneLogin,
  onRegister,
  onGetPhoneVerificationConfiguration,
  onRequestPhoneVerification,
  onConfirmPhoneVerification,
  onRequestPasswordReset,
  onResetPasswordWithPhone,
  onDeleteAccount,
  onLogout,
  onSync,
  onUpload
}: AccountSyncPanelProps) {
  const subscriptionStatusLabels: Record<string, string> = {
    active: '已订阅',
    canceled: '已取消，将在到期后停止',
    cancelled: '已取消，将在到期后停止',
    in_grace_period: '续费宽限期',
    expired: '已到期',
    on_hold: '续费暂挂',
    not_subscribed: '未订阅'
  }
  const [mode, setMode] = useState<
    'login' | 'phone-login' | 'phone-reset' | 'register'
  >('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [phoneVerificationConfiguration, setPhoneVerificationConfiguration] =
    useState<CboardPhoneVerificationConfiguration | null>(null)
  const [phoneVerificationLoading, setPhoneVerificationLoading] =
    useState(false)
  const [phoneVerificationBusy, setPhoneVerificationBusy] = useState(false)
  const [phoneChallenge, setPhoneChallenge] =
    useState<CboardPhoneVerificationChallenge | null>(null)
  const [phoneResendSeconds, setPhoneResendSeconds] = useState(0)
  const [phoneCode, setPhoneCode] = useState('')
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [phoneVerificationToken, setPhoneVerificationToken] = useState('')
  const [phoneVerificationNotice, setPhoneVerificationNotice] = useState('')
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  const login = async () => {
    if (await onLogin({ email, password })) setPassword('')
  }

  const resetPhoneVerification = () => {
    setPhoneChallenge(null)
    setPhoneResendSeconds(0)
    setPhoneCode('')
    setVerifiedPhone('')
    setPhoneVerificationToken('')
    setPhoneVerificationNotice('')
  }

  const clearPasswordFields = () => {
    setPassword('')
    setPasswordRepeat('')
  }

  useEffect(() => {
    if (phoneResendSeconds <= 0) return undefined
    const timer = setTimeout(() => {
      setPhoneResendSeconds(seconds => Math.max(0, seconds - 1))
    }, 1000)
    return () => clearTimeout(timer)
  }, [phoneResendSeconds])

  const loadPhoneVerificationConfiguration = async () => {
    if (phoneVerificationConfiguration || phoneVerificationLoading) return
    setPhoneVerificationLoading(true)
    const result = await onGetPhoneVerificationConfiguration()
    setPhoneVerificationLoading(false)
    if (result.ok && result.value) {
      setPhoneVerificationConfiguration(result.value)
      setPhoneVerificationNotice('')
      return
    }
    setPhoneVerificationConfiguration({
      available: false,
      phoneLoginAvailable: false,
      phonePasswordResetAvailable: false,
      requiredForPhoneRegistration: true,
      challengeExpiresInSeconds: 300,
      verificationExpiresInSeconds: 600,
      resendAfterSeconds: 60,
      codeLength: 6
    })
    setPhoneVerificationNotice(
      `${result.message} 为保护账号，暂不允许跳过手机号验证。`
    )
  }

  const selectRegisterMode = () => {
    setMode('register')
    clearPasswordFields()
    resetPhoneVerification()
    void loadPhoneVerificationConfiguration()
  }

  const selectPhoneLoginMode = () => {
    setMode('phone-login')
    clearPasswordFields()
    resetPhoneVerification()
    void loadPhoneVerificationConfiguration()
  }

  const selectPhoneResetMode = () => {
    setMode('phone-reset')
    clearPasswordFields()
    resetPhoneVerification()
    void loadPhoneVerificationConfiguration()
  }

  const phoneVerificationPurpose: CboardPhoneVerificationPurpose =
    mode === 'phone-login'
      ? 'login'
      : mode === 'phone-reset'
        ? 'password-reset'
        : 'registration'

  const sendPhoneCode = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone)
    if (!isValidMainlandChinaPhone(normalizedPhone)) {
      setPhoneVerificationNotice('请先输入中国大陆 11 位手机号。')
      return
    }
    setPhoneVerificationBusy(true)
    try {
      const result = await onRequestPhoneVerification({
        phone: normalizedPhone,
        purpose: phoneVerificationPurpose
      })
      setPhoneVerificationNotice(result.message)
      if (!result.ok || !result.value) return
      setPhoneChallenge(result.value)
      setPhoneResendSeconds(result.value.resendAfterSeconds)
      setPhoneCode('')
      setVerifiedPhone('')
      setPhoneVerificationToken('')
    } finally {
      setPhoneVerificationBusy(false)
    }
  }

  const confirmPhoneCode = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone)
    if (!phoneChallenge || phoneCode.length !== 6) {
      setPhoneVerificationNotice('请输入收到的 6 位手机验证码。')
      return
    }
    setPhoneVerificationBusy(true)
    try {
      const result = await onConfirmPhoneVerification({
        challengeId: phoneChallenge.challengeId,
        phone: normalizedPhone,
        code: phoneCode,
        purpose: phoneVerificationPurpose
      })
      setPhoneVerificationNotice(result.message)
      if (!result.ok || !result.value) return
      setVerifiedPhone(normalizedPhone)
      setPhoneVerificationToken(result.value.verificationToken)
      setPhoneCode('')
    } finally {
      setPhoneVerificationBusy(false)
    }
  }

  const register = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone)
    const phoneVerified = hasMatchingPhoneVerification({
      phone: normalizedPhone,
      verifiedPhone,
      verificationToken: phoneVerificationToken
    })
    if (
      phoneVerificationConfiguration &&
      phoneVerificationConfiguration.requiredForPhoneRegistration &&
      !phoneVerified
    ) {
      setPhoneVerificationNotice('请先完成手机号验证。')
      return
    }
    if (await onRegister({
      name,
      email,
      phone,
      password,
      ...(phoneVerified ? { phoneVerificationToken } : {})
    })) {
      setPhone('')
      setPassword('')
      resetPhoneVerification()
    }
  }

  const loginWithPhone = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone)
    if (!hasMatchingPhoneVerification({
      phone: normalizedPhone,
      verifiedPhone,
      verificationToken: phoneVerificationToken
    })) {
      setPhoneVerificationNotice('请先完成手机号验证。')
      return
    }
    const loggedIn = await onPhoneLogin({
      phone: normalizedPhone,
      phoneVerificationToken
    })
    resetPhoneVerification()
    if (loggedIn) setPhone('')
  }

  const resetPasswordWithPhone = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone)
    if (!hasMatchingPhoneVerification({
      phone: normalizedPhone,
      verifiedPhone,
      verificationToken: phoneVerificationToken
    })) {
      setPhoneVerificationNotice('请先完成手机号验证。')
      return
    }
    if (
      password.length < 6 ||
      password.length > 128 ||
      password !== passwordRepeat
    ) {
      setPhoneVerificationNotice('两次新密码必须一致，且长度为 6 到 128 位。')
      return
    }
    const reset = await onResetPasswordWithPhone({
      phone: normalizedPhone,
      phoneVerificationToken,
      password
    })
    resetPhoneVerification()
    setPassword('')
    setPasswordRepeat('')
    if (reset) {
      setPhone('')
      setMode('login')
    }
  }

  const deleteAccount = async () => {
    if (!isAccountDeletionConfirmation(deleteConfirmation)) return
    if (await onDeleteAccount()) {
      setDeleteConfirmation('')
      setShowDeleteAccount(false)
    }
  }

  const activePhoneVerificationAvailable = Boolean(
    phoneVerificationConfiguration &&
      (mode === 'phone-login'
        ? phoneVerificationConfiguration.phoneLoginAvailable
        : mode === 'phone-reset'
          ? phoneVerificationConfiguration.phonePasswordResetAvailable
          : phoneVerificationConfiguration.available)
  )

  return (
    <View className='account-sync'>
      <View className='account-sync__heading'>
        <Text className='account-sync__title'>CBoard 账号与云同步</Text>
        <Text className='account-sync__hint'>
          未登录仍可离线沟通；首次登录会先确认是否合并公共常用语、文字历史和确认接收记录。私人图片、家属修正和录音不会随账号同步上传。
        </Text>
      </View>

      {session ? (
        <View className='account-sync__session'>
          <Text className='account-sync__identity'>
            {session.user.name || session.user.email || '已登录 CBoard 账号'}
          </Text>
          {session.user.email && (
            <Text className='account-sync__email'>{session.user.email}</Text>
          )}
          {session.user.phoneMasked && (
            <Text className='account-sync__phone'>
              手机号：{session.user.phoneMasked}
            </Text>
          )}
          {session.subscription && (
            <View className='account-sync__subscription'>
              <Text className='account-sync__hint'>
                订阅状态：{
                  subscriptionStatusLabels[session.subscription.status] ||
                  session.subscription.status ||
                  '未订阅'
                }
              </Text>
              {session.subscription.product &&
                session.subscription.product.title && (
                <Text className='account-sync__hint'>
                  当前方案：{session.subscription.product.title}
                </Text>
              )}
              {session.subscription.expiryDate && (
                <Text className='account-sync__hint'>
                  到期时间：{
                    new Date(session.subscription.expiryDate).toLocaleString()
                  }
                </Text>
              )}
              <Text className='account-sync__hint'>
                微信端当前仅显示服务端确认的订阅状态，不会在此处自动扣费。
              </Text>
            </View>
          )}
          <View className='account-sync__actions'>
            <Button
              id='account-sync-button'
              className='button button--primary'
              disabled={busy}
              onClick={() => void onSync()}
            >
              {busy ? '同步中' : '立即同步'}
            </Button>
            <Button
              id='account-upload-button'
              className='button button--outline'
              disabled={busy}
              onClick={() => void onUpload()}
            >
              仅上传本机
            </Button>
            <Button
              id='account-logout-button'
              className='button button--quiet'
              disabled={busy}
              onClick={onLogout}
            >
              退出账号
            </Button>
          </View>
          <View className='account-sync__danger'>
            <Button
              id='account-delete-open-button'
              className='button account-sync__danger-open'
              disabled={busy}
              onClick={() => {
                setDeleteConfirmation('')
                setShowDeleteAccount(value => !value)
              }}
            >
              删除云端账号
            </Button>
            {showDeleteAccount && (
              <View className='account-sync__danger-confirmation'>
                <Text className='account-sync__danger-title'>
                  永久删除 CBoard 云端账号
                </Text>
                <Text className='account-sync__danger-hint'>
                  云端设置、图板、常用语和确认接收记录将被删除且无法恢复。本机图卡、家庭图片和沟通历史会保留。请输入 {ACCOUNT_DELETE_CONFIRMATION_TEXT} 后继续。
                </Text>
                <Input
                  id='account-delete-confirmation-input'
                  className='account-sync__input account-sync__danger-input'
                  maxlength={ACCOUNT_DELETE_CONFIRMATION_TEXT.length}
                  aria-label='删除账号确认文字'
                  placeholder='输入 delete-account'
                  value={deleteConfirmation}
                  onInput={event =>
                    setDeleteConfirmation(event.detail.value)
                  }
                />
                <View className='account-sync__danger-actions'>
                  <Button
                    id='account-delete-confirm-button'
                    className='button account-sync__danger-confirm'
                    disabled={
                      busy ||
                      !isAccountDeletionConfirmation(deleteConfirmation)
                    }
                    onClick={() => void deleteAccount()}
                  >
                    {busy ? '删除中' : '继续永久删除'}
                  </Button>
                  <Button
                    id='account-delete-cancel-button'
                    className='button button--quiet'
                    disabled={busy}
                    onClick={() => {
                      setDeleteConfirmation('')
                      setShowDeleteAccount(false)
                    }}
                  >
                    取消
                  </Button>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View className='account-sync__form'>
          <View className='account-sync__mode'>
            <Button
              id='account-password-login-mode-button'
              className={mode === 'login'
                ? 'review-action settings-option--active'
                : 'review-action'}
              onClick={() => {
                setMode('login')
                clearPasswordFields()
                resetPhoneVerification()
              }}
            >
              邮箱登录
            </Button>
            <Button
              id='account-phone-login-mode-button'
              className={mode === 'phone-login'
                ? 'review-action settings-option--active'
                : 'review-action'}
              onClick={selectPhoneLoginMode}
            >
              手机验证码登录
            </Button>
            <Button
              id='account-register-mode-button'
              className={mode === 'register'
                ? 'review-action settings-option--active'
                : 'review-action'}
              onClick={selectRegisterMode}
            >
              注册
            </Button>
            <Button
              id='account-phone-reset-mode-button'
              className={mode === 'phone-reset'
                ? 'review-action settings-option--active'
                : 'review-action'}
              onClick={selectPhoneResetMode}
            >
              手机找回密码
            </Button>
          </View>
          {mode === 'register' && (
            <Input
              id='account-name-input'
              className='account-sync__input'
              maxlength={80}
              placeholder='姓名'
              value={name}
              onInput={event => setName(event.detail.value)}
            />
          )}
          {mode !== 'login' && (
            <>
              <Input
                id='account-phone-input'
                className='account-sync__input'
                type='number'
                maxlength={11}
                placeholder='中国大陆 11 位手机号'
                value={phone}
                onInput={event => {
                  const nextPhone = event.detail.value
                  if (
                    normalizeMainlandChinaPhone(nextPhone) !==
                      normalizeMainlandChinaPhone(phone)
                  ) {
                    resetPhoneVerification()
                  }
                  setPhone(nextPhone)
                }}
              />
              <View className='account-sync__phone-verification'>
                {phoneVerificationLoading ? (
                  <Text className='account-sync__hint'>读取短信验证配置中…</Text>
                ) : activePhoneVerificationAvailable ? (
                  <>
                    <Button
                      id='account-phone-code-send-button'
                      className='button button--outline'
                      disabled={
                        busy ||
                        phoneVerificationBusy ||
                        phoneResendSeconds > 0 ||
                        Boolean(phoneVerificationToken)
                      }
                      onClick={() => void sendPhoneCode()}
                    >
                      {phoneResendSeconds > 0
                        ? `${phoneResendSeconds} 秒后可重发`
                        : phoneChallenge
                          ? '重新发送验证码'
                          : '发送验证码'}
                    </Button>
                    {phoneChallenge && !phoneVerificationToken && (
                      <View className='account-sync__phone-code-row'>
                        <Input
                          id='account-phone-code-input'
                          className='account-sync__input'
                          type='number'
                          maxlength={6}
                          placeholder='6 位手机验证码'
                          value={phoneCode}
                          onInput={event =>
                            setPhoneCode(
                              event.detail.value.replace(/\D/g, '').slice(0, 6)
                            )
                          }
                        />
                        <Button
                          id='account-phone-code-confirm-button'
                          className='button button--primary'
                          disabled={
                            busy ||
                            phoneVerificationBusy ||
                            phoneCode.length !== 6
                          }
                          onClick={() => void confirmPhoneCode()}
                        >
                          验证手机号
                        </Button>
                      </View>
                    )}
                    {phoneVerificationToken && (
                      <Text className='account-sync__phone-verified'>
                        {mode === 'phone-login'
                          ? '手机号已验证，可以登录'
                          : mode === 'phone-reset'
                            ? '手机号已验证，请设置新密码'
                            : '手机号已验证，本次注册有效'}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text className='account-sync__configuration'>
                    {mode === 'phone-login'
                      ? '短信验证服务尚未配置，当前不能使用手机号登录。'
                      : mode === 'phone-reset'
                        ? '短信验证服务尚未配置，当前不能使用手机号找回密码。'
                        : '短信验证服务尚未配置，当前不能完成手机号注册。'}
                  </Text>
                )}
                {phoneVerificationNotice && (
                  <Text
                    id='account-phone-verification-notice'
                    className='storage-notice'
                  >
                    {phoneVerificationNotice}
                  </Text>
                )}
              </View>
            </>
          )}
          {(mode === 'login' || mode === 'register') && (
            <>
              <Input
                id='account-email-input'
                className='account-sync__input'
                maxlength={254}
                placeholder='邮箱'
                value={email}
                onInput={event => setEmail(event.detail.value)}
              />
            </>
          )}
          {mode !== 'phone-login' && (
            <Input
              id='account-password-input'
              className='account-sync__input'
              maxlength={128}
              password
              placeholder={
                mode === 'phone-reset'
                  ? '新密码（6 到 128 位）'
                  : '密码（至少 6 位）'
              }
              value={password}
              onInput={event => setPassword(event.detail.value)}
            />
          )}
          {mode === 'phone-reset' && (
            <Input
              id='account-password-repeat-input'
              className='account-sync__input'
              maxlength={128}
              password
              placeholder='再次输入新密码'
              value={passwordRepeat}
              onInput={event => setPasswordRepeat(event.detail.value)}
            />
          )}
          <Button
            id={
              mode === 'login'
                ? 'account-login-button'
                : mode === 'phone-login'
                  ? 'account-phone-login-button'
                  : mode === 'phone-reset'
                    ? 'account-phone-reset-button'
                    : 'account-register-button'
            }
            className='button button--primary'
            disabled={
              busy ||
              phoneVerificationBusy ||
              !configured ||
              (mode === 'register' &&
                (phoneVerificationLoading ||
                  !phoneVerificationConfiguration ||
                  (phoneVerificationConfiguration
                    .requiredForPhoneRegistration &&
                    !hasMatchingPhoneVerification({
                      phone,
                      verifiedPhone,
                      verificationToken: phoneVerificationToken
                    })))) ||
              (mode === 'phone-login' &&
                (phoneVerificationLoading ||
                  !(
                    phoneVerificationConfiguration &&
                    phoneVerificationConfiguration.phoneLoginAvailable
                  ) ||
                  !hasMatchingPhoneVerification({
                    phone,
                    verifiedPhone,
                    verificationToken: phoneVerificationToken
                  }))) ||
              (mode === 'phone-reset' &&
                (phoneVerificationLoading ||
                  !(
                    phoneVerificationConfiguration &&
                    phoneVerificationConfiguration
                      .phonePasswordResetAvailable
                  ) ||
                  !hasMatchingPhoneVerification({
                    phone,
                    verifiedPhone,
                    verificationToken: phoneVerificationToken
                  }) ||
                  password.length < 6 ||
                  password.length > 128 ||
                  password !== passwordRepeat))
            }
            onClick={() =>
              void (mode === 'login'
                ? login()
                : mode === 'phone-login'
                  ? loginWithPhone()
                  : mode === 'phone-reset'
                    ? resetPasswordWithPhone()
                    : register())
            }
          >
            {busy
              ? '请稍候'
              : mode === 'login'
                ? '登录并合并'
                : mode === 'phone-login'
                  ? '手机号登录并合并'
                  : mode === 'phone-reset'
                    ? '重置密码'
                    : '注册账号'}
          </Button>
          {mode === 'login' && (
            <Button
              id='account-password-reset-button'
              className='button button--quiet account-sync__password-reset'
              disabled={busy || !configured}
              onClick={() => void onRequestPasswordReset({ email })}
            >
              忘记密码？发送重置邮件
            </Button>
          )}
        </View>
      )}

      {!configured && (
        <Text className='account-sync__configuration'>
          尚未配置 cboard-api HTTPS 地址，当前保持纯离线模式。
        </Text>
      )}
      {notice && (
        <Text id='account-sync-notice' className='storage-notice'>
          {notice}
        </Text>
      )}
    </View>
  )
}
