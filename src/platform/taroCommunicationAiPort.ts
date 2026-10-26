import Taro from '@tarojs/taro'
import { createCareAiRequestJournal } from '@cboard-communication-core/careAiRequestJournal'

import { apiBaseUrlFor } from '../config/runtimeCapabilities'
import { createCommunicationAiPort } from './communicationAiPort'
import { taroCboardSessionStore } from './taroCboardAccountPort'
import { careScopedKey, currentCareContext } from './taroCareContext'

interface FrozenCareAiScope {
  origin: string
  accountId: string
  familyId: string
  profileId: string
  fundingId: string
  token: string
}

const safeError = (code: string) => Object.assign(new Error(code), { code })
const aiBase = () => String(apiBaseUrlFor('textAiFeatures') || '').trim().replace(/\/+$/, '')

// Captured only for the in-process request, never written to the journal or
// sent as a request header/body. The normal Authorization header remains used.
export function assertCareAiRequestScope(scope: FrozenCareAiScope) {
  const session = taroCboardSessionStore.load()
  const context = currentCareContext()
  if (!session || session.user.id !== scope.accountId || session.token !== scope.token ||
      !context || context.accountId !== scope.accountId || context.familyId !== scope.familyId ||
      context.profileId !== scope.profileId || context.selection?.locked ||
      Boolean(Taro.getStorageSync(careScopedKey('care-locked'))) ||
      aiBase() !== scope.origin ||
      Taro.getStorageSync(`care-funding-v1:${scope.accountId}:${scope.profileId}`) !== scope.fundingId) {
    throw safeError('AI_REQUEST_CONTEXT_CHANGED')
  }
}

export function createTaroCommunicationAiPort() {
  const journal = createCareAiRequestJournal({ storage: {
    getItem(key: string) {
      const value = Taro.getStorageSync(key)
      if (value === undefined || value === null || value === '') return null
      if (typeof value !== 'string') throw safeError('AI_REQUEST_STORAGE_UNAVAILABLE')
      return value
    },
    setItem(key: string, value: string) { Taro.setStorageSync(key, value); return true }
  } })
  return createCommunicationAiPort({
  apiBaseUrl: apiBaseUrlFor('aiFeatures'),
  textApiBaseUrl: aiBase(),
  getAuthToken: () => taroCboardSessionStore.getAuthToken(),
  request: async options => {
    const operation = options.url === aiBase() + '/gpt/communication/sentences'
      ? 'communication-sentences'
      : options.url === aiBase() + '/gpt/communication/resegment'
        ? 'communication-resegment' : ''
    // Legacy non-Care endpoints retain their prior transport. Durable replay is
    // guaranteed here only for the server's Care-funded text AI workflow.
    if (process.env.TARO_APP_CARE_COLLABORATION !== 'true' || !operation) {
      const response = await Taro.request({
        url: options.url, method: options.method, data: options.data, header: options.header
      })
      return { statusCode: response.statusCode, data: response.data }
    }
    const context = currentCareContext()
    const session = taroCboardSessionStore.load()
    if (!context?.profileId || !session || context.accountId !== session.user.id) {
      throw safeError('PROFILE_ACCESS_DENIED')
    }
    const fundingId = Taro.getStorageSync(`care-funding-v1:${context.accountId}:${context.profileId}`)
    if (!fundingId || typeof fundingId !== 'string') throw safeError('EXPLICIT_FUNDING_REQUIRED')
    const frozen: FrozenCareAiScope = {
      origin: aiBase(), accountId: context.accountId, familyId: context.familyId,
      profileId: context.profileId, fundingId, token: session.token
    }
    if (options.header.Authorization !== `Bearer ${frozen.token}`) throw safeError('AI_REQUEST_CONTEXT_CHANGED')
    const ticket = journal.prepare({ origin: frozen.origin, accountId: frozen.accountId,
      familyId: frozen.familyId, profileId: frozen.profileId, fundingId: frozen.fundingId,
      operation, body: options.data, localIdentity: options.localIdentity })
    if (options.draftContext) options.draftContext.beforeDispatch({ ...ticket, body: options.data })
    // prepare intentionally precedes dispatch: a storage failure must never
    // leave a paid request without the identity needed to retry it safely.
    assertCareAiRequestScope(frozen)
    const request = {
      url: options.url,
      method: options.method,
      timeout: 20000,
      data: options.data,
      header: { ...options.header, 'Idempotency-Key': ticket.requestId,
        'X-Care-Profile-Id': frozen.profileId, 'X-Care-Funding-Id': frozen.fundingId },
      __careAiRequestScope: frozen
    }
    let response
    try { response = await Taro.request(request) }
    catch (error: any) {
      const code = error?.code === 'AI_REQUEST_CONTEXT_CHANGED'
        ? error.code : 'AI_REQUEST_RESULT_UNKNOWN'
      try { journal.observe(ticket, { code }); options.draftContext?.afterResponse(ticket, false) } catch (_) { /* prepare already persisted the stable identity. */ }
      throw safeError(code)
    }
    const payload = response.data as any
    const code = String(payload?.code || payload?.error?.code || '') ||
      (response.statusCode >= 500 || response.statusCode === 408 ? 'AI_REQUEST_RESULT_UNKNOWN' : '')
    try { journal.observe(ticket, { status: response.statusCode, code }); options.draftContext?.afterResponse(ticket, response.statusCode >= 200 && response.statusCode < 300) }
    catch (_) { /* Deterministic replay remains available from the prepared record. */ }
    assertCareAiRequestScope(frozen)
    return { statusCode: response.statusCode,
      data: code === 'AI_REQUEST_RESULT_UNKNOWN' ? { code } : response.data }
  }
  })
}

export const taroCommunicationAiPort = createTaroCommunicationAiPort()
