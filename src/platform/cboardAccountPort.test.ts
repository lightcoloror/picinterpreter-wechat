import { describe, expect, test, vi } from 'vitest'

import { createCboardAccountPort } from './cboardAccountPort'

function createHarness(apiBaseUrl = 'https://api.example.test') {
  const request = vi.fn(async ({ url }: { url: string }) => {
    if (url.endsWith('/user/store-password/phone')) {
      return {
        statusCode: 200,
        data: {
          success: 1,
          message: 'Password reset. Please sign in again.'
        }
      }
    }
    if (url.endsWith('/user/login/phone')) {
      return {
        statusCode: 200,
        data: {
          id: 'user-1',
          name: '照护者',
          email: 'care@example.test',
          phoneMasked: '138****8000',
          authToken: 'phone-secret-token',
          settings: { communicationSupport: { savedPhrases: [], history: [] } }
        }
      }
    }
    if (url.endsWith('/user/login')) {
      return {
        statusCode: 200,
        data: {
          id: 'user-1',
          name: '照护者',
          email: 'care@example.test',
          phoneMasked: '138****8000',
          authToken: 'secret-token',
          settings: { communicationSupport: { savedPhrases: [], history: [] } },
          subscriber: {
            id: 'subscriber-1',
            status: 'ACTIVE',
            expiryDate: '2026-08-01T00:00:00.000Z',
            product: {
              title: '家庭支持方案',
              billingPeriod: 'P1M',
              price: { currencyCode: 'CNY', units: 12 }
            },
            transaction: { purchaseToken: 'must-not-enter-session' }
          }
        }
      }
    }
    if (url.endsWith('/user/phone-verification/confirm')) {
      return {
        statusCode: 200,
        data: {
          verificationToken: 'b'.repeat(64),
          expiresInSeconds: 600
        }
      }
    }
    if (url.endsWith('/user/phone-verification')) {
      return {
        statusCode: 200,
        data: {
          available: true,
          phoneLoginAvailable: true,
          phonePasswordResetAvailable: true,
          requiredForPhoneRegistration: true,
          challengeExpiresInSeconds: 300,
          verificationExpiresInSeconds: 600,
          resendAfterSeconds: 60,
          codeLength: 6,
          challengeId: 'a'.repeat(64),
          phoneMasked: '138****8000',
          expiresInSeconds: 300
        }
      }
    }
    if (url.endsWith('/user')) {
      return {
        statusCode: 200,
        data: { message: 'Please verify your email.' }
      }
    }
    if (url.endsWith('/user/forgot')) {
      return {
        statusCode: 200,
        data: { message: 'Check your email.' }
      }
    }
    return { statusCode: 200, data: { language: 'zho' } }
  })

  return {
    request,
    port: createCboardAccountPort({ apiBaseUrl, request })
  }
}

describe('cboardAccountPort', () => {
  test('logs in through the existing CBoard endpoint and keeps the token in headers later', async () => {
    const harness = createHarness()
    const login = await harness.port.login({
      email: ' CARE@example.test ',
      password: '123456'
    })
    const settings = await harness.port.getSettings(login.value!.token)

    expect(login.value).toEqual(expect.objectContaining({
      token: 'secret-token',
      user: expect.objectContaining({
        email: 'care@example.test',
        phoneMasked: '138****8000'
      }),
      subscription: {
        id: 'subscriber-1',
        status: 'active',
        expiryDate: '2026-08-01T00:00:00.000Z',
        product: {
          title: '家庭支持方案',
          billingPeriod: 'P1M',
          price: { currencyCode: 'CNY', units: 12 }
        }
      }
    }))
    expect(JSON.stringify(login.value)).not.toContain('purchaseToken')
    expect(settings.ok).toBe(true)
    expect(harness.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://api.example.test/settings',
      header: expect.objectContaining({
        Authorization: 'Bearer secret-token'
      })
    }))
  })

  test('registers through the existing email activation flow', async () => {
    const harness = createHarness()
    const result = await harness.port.register({
      name: '照护者',
      email: 'care@example.test',
      phone: '138 0013 8000',
      password: '123456',
      phoneVerificationToken: 'b'.repeat(64)
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: { requiresActivation: true }
    }))
    expect(harness.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.test/user',
      data: {
        name: '照护者',
        email: 'care@example.test',
        phone: '13800138000',
        password: '123456',
        phoneVerificationToken: 'b'.repeat(64)
      }
    }))
  })

  test('logs in with a purpose-bound phone verification token', async () => {
    const harness = createHarness()
    const result = await harness.port.loginWithPhone({
      phone: '138 0013 8000',
      phoneVerificationToken: 'b'.repeat(64)
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        token: 'phone-secret-token',
        user: expect.objectContaining({
          email: 'care@example.test',
          phoneMasked: '138****8000'
        })
      })
    }))
    expect(harness.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://api.example.test/user/login/phone',
      method: 'POST',
      data: {
        phone: '13800138000',
        phoneVerificationToken: 'b'.repeat(64)
      }
    }))
  })

  test('requests and confirms a server-side phone challenge', async () => {
    const harness = createHarness()

    const configuration =
      await harness.port.getPhoneVerificationConfiguration()
    const challenge = await harness.port.requestPhoneVerification({
      phone: '138 0013 8000'
    })
    const confirmed = await harness.port.confirmPhoneVerification({
      challengeId: challenge.value!.challengeId,
      phone: '13800138000',
      code: '123456'
    })

    expect(configuration.value).toEqual(expect.objectContaining({
      available: true,
      phoneLoginAvailable: true,
      phonePasswordResetAvailable: true,
      requiredForPhoneRegistration: true,
      codeLength: 6
    }))
    expect(challenge.value).toEqual(expect.objectContaining({
      phoneMasked: '138****8000',
      challengeId: 'a'.repeat(64)
    }))
    expect(confirmed.value).toEqual({
      verificationToken: 'b'.repeat(64),
      expiresInSeconds: 600
    })
    expect(harness.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://api.example.test/user/phone-verification/confirm',
      data: {
        challengeId: 'a'.repeat(64),
        phone: '13800138000',
        code: '123456',
        purpose: 'registration'
      }
    }))
  })

  test('binds phone login challenge and confirmation to login purpose', async () => {
    const harness = createHarness()

    const challenge = await harness.port.requestPhoneVerification({
      phone: '13800138000',
      purpose: 'login'
    })
    await harness.port.confirmPhoneVerification({
      challengeId: challenge.value!.challengeId,
      phone: '13800138000',
      code: '123456',
      purpose: 'login'
    })

    expect(harness.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: { phone: '13800138000', purpose: 'login' }
      })
    )
    expect(harness.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          challengeId: 'a'.repeat(64),
          phone: '13800138000',
          code: '123456',
          purpose: 'login'
        }
      })
    )
  })

  test('binds password reset verification and resets without creating a session', async () => {
    const harness = createHarness()
    const challenge = await harness.port.requestPhoneVerification({
      phone: '13800138000',
      purpose: 'password-reset'
    })
    const confirmed = await harness.port.confirmPhoneVerification({
      challengeId: challenge.value!.challengeId,
      phone: '13800138000',
      code: '123456',
      purpose: 'password-reset'
    })
    const reset = await harness.port.resetPasswordWithPhone({
      phone: '13800138000',
      phoneVerificationToken: confirmed.value!.verificationToken,
      password: 'new-password'
    })

    expect(reset).toEqual({
      ok: true,
      message: '密码已重置，请使用新密码重新登录。',
      value: { reset: true }
    })
    expect(harness.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: { phone: '13800138000', purpose: 'password-reset' }
      })
    )
    expect(harness.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          challengeId: 'a'.repeat(64),
          phone: '13800138000',
          code: '123456',
          purpose: 'password-reset'
        }
      })
    )
    expect(harness.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        url: 'https://api.example.test/user/store-password/phone',
        data: {
          phone: '13800138000',
          phoneVerificationToken: 'b'.repeat(64),
          password: 'new-password'
        }
      })
    )
  })

  test('rejects an unverified or weak phone password reset locally', async () => {
    const harness = createHarness()
    const result = await harness.port.resetPasswordWithPhone({
      phone: '13800138000',
      phoneVerificationToken: 'short',
      password: '123'
    })

    expect(result.ok).toBe(false)
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('rejects an invalid registration phone before making a request', async () => {
    const harness = createHarness()
    const result = await harness.port.register({
      name: '照护者',
      email: 'care@example.test',
      phone: '2800138000',
      password: '123456'
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('11 位手机号')
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('reuses the existing CBoard password reset endpoint without authentication', async () => {
    const harness = createHarness()
    const result = await harness.port.requestPasswordReset({
      email: ' CARE@example.test '
    })

    expect(result).toEqual({
      ok: true,
      message:
        '如果该邮箱已注册，密码重置邮件将很快发送，请检查收件箱和垃圾邮件。',
      value: { requested: true }
    })
    expect(harness.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.test/user/forgot',
      method: 'POST',
      data: { email: 'care@example.test' },
      header: { 'Content-Type': 'application/json' }
    }))
  })

  test('rejects an invalid reset email before making a request', async () => {
    const harness = createHarness()
    const result = await harness.port.requestPasswordReset({
      email: 'not-an-email'
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('有效邮箱')
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('deletes the current CBoard account with owner authentication', async () => {
    const harness = createHarness()
    const result = await harness.port.deleteAccount(
      'secret-token',
      'account/user 1'
    )

    expect(result).toEqual({
      ok: true,
      message: 'CBoard 云端账号已永久删除。',
      value: { accountId: 'account/user 1' }
    })
    expect(harness.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://api.example.test/account/account%2Fuser%201',
      method: 'DELETE',
      header: expect.objectContaining({
        Authorization: 'Bearer secret-token'
      })
    }))
  })

  test('does not attempt account deletion without both session fields', async () => {
    const harness = createHarness()

    expect((await harness.port.deleteAccount('', 'user-1')).ok).toBe(false)
    expect((await harness.port.deleteAccount('token', '')).ok).toBe(false)
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('rejects invalid credentials before making a request', async () => {
    const harness = createHarness()
    const result = await harness.port.login({
      email: 'invalid',
      password: '123'
    })

    expect(result.ok).toBe(false)
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('does not treat a response without authToken as a logged-in session', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: { email: 'care@example.test' }
    })

    const result = await harness.port.login({
      email: 'care@example.test',
      password: '123456'
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('授权令牌')
    }))
  })

  test('does not merge anonymous data when the login response has no account id', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        authToken: 'secret-token',
        email: 'care@example.test'
      }
    })

    const result = await harness.port.login({
      email: 'care@example.test',
      password: '123456'
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('账号标识')
    }))
  })

  test('keeps offline communication available when no API is configured', async () => {
    const harness = createHarness('')
    const result = await harness.port.getSettings('token')

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('离线沟通')
    }))
    expect(harness.request).not.toHaveBeenCalled()
  })

  test('uploads confirmed receiver records without local maintenance fields', async () => {
    const harness = createHarness()
    await harness.port.syncConfirmedReceiverRecords('secret-token', [
      {
        id: 'receiver-confirmed',
        sessionId: 'session-1',
        patientId: 'patient-1',
        workspaceId: 'workspace-1',
        direction: 'receive',
        recordStatus: 'confirmed',
        inputText: '我想喝水',
        labels: ['水'],
        pictogramSequence: [{
          pictogramId: 'water',
          label: '水',
          source: 'online',
          boardId: 'home',
          matchType: 'online',
          confidence: 0.8,
          originalToken: '水'
        }],
        createdAt: 10,
        updatedAt: 10,
        confirmedAt: 10
      },
      {
        id: 'receiver-draft',
        sessionId: 'session-1',
        patientId: 'patient-1',
        workspaceId: 'workspace-1',
        direction: 'receive',
        recordStatus: 'draft',
        inputText: '草稿',
        labels: ['草稿'],
        createdAt: 20,
        updatedAt: 20
      }
    ])

    expect(harness.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://api.example.test/communication/receiver-records/sync',
      data: {
        records: [
          expect.objectContaining({
            id: 'receiver-confirmed',
            recordStatus: 'confirmed'
          })
        ]
      },
      header: expect.objectContaining({
        Authorization: 'Bearer secret-token'
      })
    }))
    const lastCall = harness.request.mock.calls[
      harness.request.mock.calls.length - 1
    ]
    const uploaded = lastCall[0].data.records
    expect(uploaded[0].baseVersion).toBe(0)
    expect(uploaded[0].pictogramSequence[0]).not.toHaveProperty('boardId')
  })

  test('normalizes version conflicts and structured tombstones from the API', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        acceptedCount: 0,
        conflictCount: 1,
        conflictedRecordIds: ['receiver-1'],
        records: [],
        deletedRecordIds: [],
        deletedRecords: [{
          id: 'receiver-deleted',
          deletedAt: 30,
          deletedBy: 'user-1',
          serverVersion: 2
        }]
      }
    })

    const result = await harness.port.syncConfirmedReceiverRecords(
      'secret-token',
      []
    )

    expect(result.value).toEqual({
      acceptedCount: 0,
      conflictCount: 1,
      conflictedRecordIds: ['receiver-1'],
      records: [],
      deletedRecordIds: ['receiver-deleted'],
      deletedRecords: [{
        id: 'receiver-deleted',
        deletedAt: 30,
        deletedBy: 'user-1',
        serverVersion: 2
      }]
    })
  })

  test('marks selected receiver records as deleted with the bearer token', async () => {
    const harness = createHarness()
    const result = await harness.port.deleteConfirmedReceiverRecords(
      'secret-token',
      ['receiver-1']
    )

    expect(result.ok).toBe(true)
    expect(harness.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://api.example.test/communication/receiver-records',
      method: 'DELETE',
      data: { recordIds: ['receiver-1'] },
      header: expect.objectContaining({
        Authorization: 'Bearer secret-token'
      })
    }))
  })

  test('syncs saved phrases without sending device-private image data', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        acceptedCount: 1,
        conflictCount: 0,
        conflictedPhraseIds: [],
        phrases: [],
        deletedPhraseIds: [],
        deletedPhrases: []
      }
    })

    const result = await harness.port.syncCommunicationSavedPhrases(
      'secret-token',
      [{
        id: 'phrase-water',
        sentence: '我要喝水',
        output: [{
          id: 'device_private_family-cup',
          label: '家庭杯子',
          image: 'wxfile://private/cup.png',
          source: 'user'
        }],
        usageCount: 1,
        createdAt: 10,
        lastUsedAt: 15,
        updatedAt: 20,
        serverVersion: 2
      }]
    )

    expect(result.ok).toBe(true)
    expect(harness.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url:
          'https://api.example.test/communication/saved-phrases/sync',
        method: 'POST',
        data: {
          phrases: [
            expect.objectContaining({
              id: 'phrase-water',
              baseVersion: 2,
              output: [{ label: '家庭杯子' }]
            })
          ]
        },
        header: expect.objectContaining({
          Authorization: 'Bearer secret-token'
        })
      })
    )
    expect(
      JSON.stringify(harness.request.mock.calls.at(-1)?.[0].data)
    ).not.toContain('wxfile:')
  })

  test('deletes saved phrases with the bearer token', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        deletedCount: 1,
        deletedPhraseIds: ['phrase-water'],
        deletedPhrases: [{
          id: 'phrase-water',
          deletedAt: 30,
          deletedBy: 'user-1',
          serverVersion: 3
        }]
      }
    })

    const result = await harness.port.deleteCommunicationSavedPhrases(
      'secret-token',
      ['phrase-water']
    )

    expect(result.value?.deletedPhrases[0]).toEqual(
      expect.objectContaining({
        id: 'phrase-water',
        serverVersion: 3
      })
    )
    expect(harness.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/communication/saved-phrases',
        method: 'DELETE',
        data: { phraseIds: ['phrase-water'] },
        header: expect.objectContaining({
          Authorization: 'Bearer secret-token'
        })
      })
    )
  })
})
