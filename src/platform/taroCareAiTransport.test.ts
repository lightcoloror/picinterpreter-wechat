import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import Taro from '@tarojs/taro'
import { buildCommunicationAiSentenceRequest } from '@cboard-communication-core/communicationAi'
import { buildPersonalPictogramTileDTO } from '@cboard-communication-core/pictogramMetadataSuggestion'
import { createTaroCommunicationAiPort } from './taroCommunicationAiPort'
import { createExpressionSession, expressionSessionReducer, restoreExpressionSession } from '../features/communication/session'
import { buildExpressionHistoryEntry } from '@cboard-communication-core/expressionPipeline'
import { createWechatCommunicationRepository } from './communicationRepository'
import { createExpressionDraftService, attachExpressionDraftRequest } from '@cboard-communication-core/expressionDraft'

const h = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  user: { id: 'synthetic-a', token: 'token-synthetic-a' },
  interceptor: null as any,
  beforeInterceptor: null as null | (() => void),
  storageFailure: false,
  transport: vi.fn(async (params: any) => ({ statusCode: 200, data: { tokens: ['不', '回家'], candidates: ['我要喝水'] }, params })),
  addInterceptor: vi.fn(),
  watch: vi.fn(() => vi.fn())
}))
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => h.values.get(key),
  setStorageSync: (key: string, value: unknown) => {
    if (h.storageFailure) throw new Error('synthetic storage failure')
    h.values.set(key, value)
  },
  addInterceptor: (interceptor: any) => { h.addInterceptor(); h.interceptor = interceptor },
  request: (params: any) => {
    h.beforeInterceptor?.()
    return h.interceptor ? h.interceptor({ requestParams: params, proceed: h.transport }) : h.transport(params)
  },
  eventCenter: { on: vi.fn(), off: vi.fn() }
} }))
vi.mock('./taroCboardAccountPort', () => ({ taroCboardSessionStore: {
  load: () => ({ user: h.user, token: h.user.token }), getAuthToken: () => h.user.token
} }))
vi.mock('./taroCareRuntime', () => ({ runtime: {
  enabled: true, watch: h.watch,
  funding: (profileId: string) => h.values.get(`care-funding-v1:${h.user.id}:${profileId}`)
} }))
vi.mock('@cboard-communication-core/careSync', () => ({ createCareSync: vi.fn() }))
vi.mock('./taroPictureLibraryStore', () => ({ taroPictureLibraryStore: {} }))
vi.mock('./taroCommunicationRepository', () => ({ createTaroCommunicationRepository: vi.fn() }))
vi.mock('./taroPictogramOrderingStore', () => ({ taroPictogramOrderingStore: {} }))
vi.mock('./communicationCloudSync', () => ({ configureCareCloudSync: vi.fn() }))
vi.mock('../config/runtimeCapabilities', () => ({ apiBaseUrlFor: () => 'https://api.example.test/api' }))

function select(id: string) {
  h.user = { id, token: `token-${id}` }
  h.values.set(`care-selection-v1:${id}`, { id: `profile-${id}`, familyId: `family-${id}` })
  h.values.set(`care-funding-v1:${id}:profile-${id}`, `funding-${id}`)
}
const requestKey = (index: number) => h.transport.mock.calls[index][0].header['Idempotency-Key']
const journalRows = () => [...h.values.entries()].filter(([key]) => key.startsWith('care-ai-request-v1:'))
beforeEach(async () => {
  vi.stubEnv('TARO_APP_CARE_COLLABORATION', 'true')
  h.values.clear()
  h.beforeInterceptor = null
  h.storageFailure = false
  h.transport.mockReset().mockImplementation(async (params: any) => ({ statusCode: 200,
    data: { tokens: ['不', '回家'], candidates: ['我要喝水'] }, params }))
  select('synthetic-a')
  const { startCareWorkspace } = await import('./taroCareWorkspace')
  startCareWorkspace()
})
afterEach(() => vi.unstubAllEnvs())

test('draft write fails before dispatch and cold replay preserves anonymous wire and original funding', async () => {
  const values = new Map<string, unknown>()
  let fail = false
  const storage = { getStorageSync: (key: string) => values.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => { if (fail) throw new Error('draft write failed'); values.set(key, value) },
    removeStorageSync: (key: string) => values.delete(key) }
  const repository = createWechatCommunicationRepository(storage)
  const makeDraft = () => createExpressionDraftService({ repository })
  const output = [buildPersonalPictogramTileDTO({ id: 'private-a', boardId: 'private',
    category: 'people', label: '合成林安', image: 'synthetic-private://photo' })]
  const draft = makeDraft()
  draft.save({ pipeline: createExpressionSession(output).pipeline })
  const make = (service: any, scene: string) => attachExpressionDraftRequest(
    buildCommunicationAiSentenceRequest({ output, scene }), service)
  fail = true
  expect(await createTaroCommunicationAiPort().generateSentences(make(draft, '吃饭'))).toMatchObject({
    ok: false, code: 'EXPRESSION_DRAFT_STORAGE_FAILED', message: expect.stringContaining('保存到本机')
  })
  expect(h.transport).not.toHaveBeenCalled()
  fail = false
  h.transport.mockRejectedValueOnce(new Error('request:fail timeout'))
  expect((await createTaroCommunicationAiPort().generateSentences(make(draft, '吃饭'))).code).toBe('AI_REQUEST_RESULT_UNKNOWN')
  const cold = makeDraft(); cold.load()
  h.transport.mockImplementation(async (params: any) => ({ statusCode: 200, data: { candidates: ['⟦P1⟧'] }, params }))
  const restored = await createTaroCommunicationAiPort().generateSentences(make(cold, '过期场景'))
  expect(restored.ok && restored.value.candidates).toEqual(['合成林安'])
  expect(requestKey(0)).toBe(requestKey(1))
  expect(h.transport.mock.calls[0][0].data).toEqual(h.transport.mock.calls[1][0].data)
  expect(JSON.stringify(h.transport.mock.calls)).not.toMatch(/合成林安|synthetic-private|private-a|personId|beforeDispatch|afterResponse/)
  h.values.set('care-funding-v1:synthetic-a:profile-synthetic-a', 'other-funding')
  expect((await createTaroCommunicationAiPort().generateSentences(make(cold, '吃饭'))).code).toBe('AI_REQUEST_CONTEXT_CHANGED')
  expect(h.transport).toHaveBeenCalledTimes(2)
})

test('recovered same-name person stays selected after meaning screening, confirmation and offline storage reopen', async () => {
  const people = ['person-a', 'person-b'].map(id => buildPersonalPictogramTileDTO({ id, boardId: 'private',
    category: 'people', label: '林知岚', image: `synthetic-private://${id}` }))
  const output = [people[1], { id: 'pain', boardId: 'private', label: '痛', image: '/synthetic-pain.png' }]
  const make = () => buildCommunicationAiSentenceRequest({ output })
  h.transport.mockRejectedValueOnce(new Error('request:fail timeout'))
  h.transport.mockImplementation(async (params: any) => ({ statusCode: 200,
    data: { candidates: ['⟦P1⟧现在很痛。', '⟦P1⟧痛。'] }, params }))
  expect((await createTaroCommunicationAiPort().generateSentences(make())).code).toBe('AI_REQUEST_RESULT_UNKNOWN')
  const retry = await createTaroCommunicationAiPort().generateSentences(make())
  expect(retry.ok).toBe(true)
  let state = expressionSessionReducer(createExpressionSession(output), { type: 'apply-ai-candidates', response: retry.value! })
  expect(state.pipeline.candidateSentences).toEqual(['林知岚痛。', '我的意思是：林知岚痛。', '我想表达的是：林知岚痛。'])
  state = expressionSessionReducer(state, { type: 'select-candidate', index: 1 })
  expect(requestKey(0)).toBe(requestKey(1))
  expect(JSON.stringify(h.transport.mock.calls)).not.toMatch(/林知岚|synthetic-private|person-b|image/)
  const storage = { getStorageSync: (key: string) => h.values.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => h.values.set(key, value), removeStorageSync: (key: string) => h.values.delete(key) }
  createWechatCommunicationRepository(storage).appendCommunicationHistory(buildExpressionHistoryEntry(state.pipeline)!)
  h.transport.mockRejectedValue(new Error('offline'))
  const history = createWechatCommunicationRepository(storage).loadCommunicationHistory()
  const restored = restoreExpressionSession([{ id: 'private', name: '合成图库', tiles: [...people, output[1]] }], history)
  expect(restored.selectedTiles[0].id).toBe('person-b')
  expect(restored.selectedTiles[0].image).toBe('synthetic-private://person-b')
  expect(restored.pipeline.candidateSentences[0]).toBe('我的意思是：林知岚痛。')
  expect(h.transport).toHaveBeenCalledTimes(2)
})

test('local person identities survive timeout retries while only anonymous markers reach Taro', async () => {
  const make = (id: string) => buildCommunicationAiSentenceRequest({ output: [buildPersonalPictogramTileDTO({ id, boardId: 'private', category: 'people', label: '林知岚', image: `synthetic-private://${id}` })] })
  const port = createTaroCommunicationAiPort()
  h.transport.mockRejectedValueOnce(Object.assign(new Error('timeout'), { errMsg: 'request:fail timeout' }))
  h.transport.mockImplementation(async (params: any) => ({ statusCode: 200, data: { candidates: ['⟦P1⟧来了。'] }, params }))
  expect((await port.generateSentences(make('a'))).ok).toBe(false)
  const retry = await createTaroCommunicationAiPort().generateSentences(make('a'))
  expect(retry.ok && retry.value.candidates).toEqual(['林知岚来了。'])
  await port.generateSentences(make('b'))
  expect(requestKey(0)).toBe(requestKey(1))
  expect(requestKey(1)).not.toBe(requestKey(2))
  expect(h.transport.mock.calls[0][0].data).toEqual(h.transport.mock.calls[2][0].data)
  expect(JSON.stringify(h.transport.mock.calls)).not.toMatch(/林知岚|synthetic-private|localIdentity|personId|entries/)
})

test('real AI port preserves account/profile/source and consumes the local frozen scope marker', async () => {
  const port = createTaroCommunicationAiPort()
  expect((await port.resegment({ text: '不回家' })).ok).toBe(true)
  const first = h.transport.mock.calls[0][0]
  expect(first.header).toMatchObject({ Authorization: 'Bearer token-synthetic-a', 'X-Care-Profile-Id': 'profile-synthetic-a', 'X-Care-Funding-Id': 'funding-synthetic-a' })
  expect(first.header['Idempotency-Key']).toMatch(/^cai_[a-f0-9]{64}$/)
  expect(first).not.toHaveProperty('__careAiRequestScope')
  select('synthetic-b')
  await port.resegment({ text: '不回家' })
  const second = h.transport.mock.calls[1][0]
  expect(second.header).toMatchObject({ Authorization: 'Bearer token-synthetic-b', 'X-Care-Profile-Id': 'profile-synthetic-b', 'X-Care-Funding-Id': 'funding-synthetic-b' })
  expect(requestKey(1)).not.toBe(requestKey(0))
  h.user = { id: 'no-selection', token: 'token-no-selection' }
  expect((await port.resegment({ text: '不回家' })).code).toBe('PROFILE_ACCESS_DENIED')
  expect(h.transport).toHaveBeenCalledTimes(2)
  expect(h.addInterceptor).toHaveBeenCalledTimes(1)
})

test('same payload survives port recreation and concurrent calls; changed input has a different identity', async () => {
  const port = createTaroCommunicationAiPort()
  await Promise.all([port.resegment({ text: '不回家' }), port.resegment({ text: '不回家' })])
  await createTaroCommunicationAiPort().resegment({ text: '不回家' })
  expect(requestKey(1)).toBe(requestKey(0))
  expect(requestKey(2)).toBe(requestKey(0))
  await port.resegment({ text: '不回家吃饭' })
  expect(requestKey(3)).not.toBe(requestKey(0))
})

test('timeout retains the same durable key for a later retry and keeps private input out of metadata', async () => {
  h.transport.mockRejectedValueOnce(new Error('request:fail timeout'))
  const first = await createTaroCommunicationAiPort().resegment({ text: '不回家' })
  expect(first).toMatchObject({ ok: false, code: 'AI_REQUEST_RESULT_UNKNOWN' })
  expect(first.message).toContain('同一请求')
  expect(journalRows()).toHaveLength(1)
  const saved = String(journalRows()[0][1])
  for (const forbidden of ['不回家', 'token-synthetic-a', 'profile-synthetic-a', 'funding-synthetic-a']) expect(saved).not.toContain(forbidden)
  const retry = await createTaroCommunicationAiPort().resegment({ text: '不回家' })
  expect(retry.ok).toBe(true)
  expect(requestKey(1)).toBe(requestKey(0))
})

test('the same source text with a changed vocabulary is blocked before another paid submission', async () => {
  h.transport.mockRejectedValueOnce(new Error('request:fail timeout'))
  const port = createTaroCommunicationAiPort()
  const first = { text: '不回家', unmatchedTokens: ['回家'], pictogramVocabulary: ['家'] }
  expect((await port.resegment(first)).code).toBe('AI_REQUEST_RESULT_UNKNOWN')
  const changed = await createTaroCommunicationAiPort().resegment({
    ...first, unmatchedTokens: [], pictogramVocabulary: ['家', '回家']
  })
  expect(changed).toMatchObject({ ok: false, code: 'AI_REQUEST_INPUT_CHANGED' })
  expect(h.transport).toHaveBeenCalledTimes(1)
  // If local metadata is lost, stable source identity still lets the server
  // reject the changed body rather than treating it as a new paid request.
  for (const [key] of journalRows()) h.values.delete(key)
  await createTaroCommunicationAiPort().resegment({ ...first, pictogramVocabulary: ['回家'] })
  expect(requestKey(1)).toBe(requestKey(0))
})

test('sentence generation uses its normalized body, shared identity rules and independent operation scope', async () => {
  const input = { pictogramLabels: ['喝水'], candidateCount: 3 }
  const port = createTaroCommunicationAiPort()
  expect((await port.generateSentences(input)).ok).toBe(true)
  expect((await createTaroCommunicationAiPort().generateSentences(input)).ok).toBe(true)
  expect(requestKey(1)).toBe(requestKey(0))
  await port.generateSentences({ ...input, candidateCount: 2 })
  expect(requestKey(2)).not.toBe(requestKey(0))
  await port.resegment({ text: '不回家' })
  expect(requestKey(3)).not.toBe(requestKey(0))
})

test('unknown server state preserves business code, status and the prior request identity', async () => {
  h.transport.mockResolvedValueOnce({ statusCode: 409,
    data: { code: 'AI_REQUEST_PENDING_RECONCILIATION' }, params: {} } as any)
  const port = createTaroCommunicationAiPort()
  const result = await port.generateSentences({ pictogramLabels: ['喝水'] })
  expect(result).toMatchObject({ ok: false, status: 409, code: 'AI_REQUEST_PENDING_RECONCILIATION' })
  expect(result.message).toContain('不会重复')
  await port.generateSentences({ pictogramLabels: ['喝水'] })
  expect(requestKey(1)).toBe(requestKey(0))
})

test('an unstructured gateway timeout remains an unknown request rather than a fresh generation', async () => {
  h.transport.mockResolvedValueOnce({ statusCode: 504, data: '<html>gateway timeout</html>', params: {} } as any)
  const port = createTaroCommunicationAiPort()
  expect(await port.resegment({ text: '不回家' })).toMatchObject({
    ok: false, status: 504, code: 'AI_REQUEST_RESULT_UNKNOWN', message: expect.stringContaining('同一请求')
  })
  await port.resegment({ text: '不回家' })
  expect(requestKey(1)).toBe(requestKey(0))
})

test('a late token rotation fails the frozen request instead of returning data into another login session', async () => {
  h.transport.mockImplementationOnce(async (params: any) => {
    h.user.token = 'synthetic-renewed-token'
    return { statusCode: 200, data: { tokens: ['不', '回家'] }, params } as any
  })
  const port = createTaroCommunicationAiPort()
  expect((await port.resegment({ text: '不回家' })).code).toBe('AI_REQUEST_CONTEXT_CHANGED')
  await port.resegment({ text: '不回家' })
  expect(requestKey(1)).toBe(requestKey(0))
  expect(h.transport.mock.calls[1][0].header.Authorization).toBe('Bearer synthetic-renewed-token')
})

test('failed or corrupt local storage fails closed before a paid request', async () => {
  h.storageFailure = true
  const port = createTaroCommunicationAiPort()
  expect((await port.resegment({ text: '不回家' })).code).toBe('AI_REQUEST_STORAGE_UNAVAILABLE')
  expect(h.transport).not.toHaveBeenCalled()
  h.storageFailure = false
  await port.resegment({ text: '不回家' })
  const key = journalRows()[0][0]
  h.values.set(key, '{corrupt')
  expect((await port.resegment({ text: '不回家' })).code).toBe('AI_REQUEST_STORAGE_UNAVAILABLE')
  expect(h.transport).toHaveBeenCalledTimes(1)
})

test('failure to record an observation never discards the prepared key or resends automatically', async () => {
  h.transport.mockImplementationOnce(async (params: any) => {
    h.storageFailure = true
    return { statusCode: 200, data: { tokens: ['不', '回家'] }, params } as any
  })
  expect((await createTaroCommunicationAiPort().resegment({ text: '不回家' })).ok).toBe(true)
  expect(h.transport).toHaveBeenCalledTimes(1)
  h.storageFailure = false
  await createTaroCommunicationAiPort().resegment({ text: '不回家' })
  expect(requestKey(1)).toBe(requestKey(0))
})

test('the non-Care legacy path stays compatible and does not claim durable retry protection', async () => {
  vi.stubEnv('TARO_APP_CARE_COLLABORATION', 'false')
  h.transport.mockRejectedValueOnce(new Error('request:fail timeout'))
  const result = await createTaroCommunicationAiPort().resegment({ text: '不回家' })
  expect(result).toMatchObject({ ok: false, message: '网络不可用，已继续使用本地规则。' })
  expect(result.code).toBeUndefined()
  expect(journalRows()).toHaveLength(0)
  expect(requestKey(0)).toBeUndefined()
})

test('account or funding changes between prepare and interceptor stop the request instead of rewriting it', async () => {
  const port = createTaroCommunicationAiPort()
  h.beforeInterceptor = () => select('synthetic-b')
  expect((await port.resegment({ text: '不回家' })).code).toBe('AI_REQUEST_CONTEXT_CHANGED')
  expect(h.transport).not.toHaveBeenCalled()
  select('synthetic-a')
  h.beforeInterceptor = () => h.values.set('care-funding-v1:synthetic-a:profile-synthetic-a', 'funding-changed')
  expect((await port.resegment({ text: '不回家' })).code).toBe('AI_REQUEST_CONTEXT_CHANGED')
  expect(h.transport).not.toHaveBeenCalled()
})

test('late results cannot enter a new account and retrying the old account keeps its original identity', async () => {
  h.transport.mockImplementationOnce(async (params: any) => {
    select('synthetic-b')
    return { statusCode: 200, data: { tokens: ['不', '回家'] }, params } as any
  })
  const port = createTaroCommunicationAiPort()
  expect((await port.resegment({ text: '不回家' })).code).toBe('AI_REQUEST_CONTEXT_CHANGED')
  select('synthetic-a')
  await port.resegment({ text: '不回家' })
  expect(requestKey(1)).toBe(requestKey(0))
})

test('funding and family changes create isolated identities without changing old records', async () => {
  const port = createTaroCommunicationAiPort()
  await port.resegment({ text: '不回家' })
  h.values.set('care-funding-v1:synthetic-a:profile-synthetic-a', 'new-funding')
  await port.resegment({ text: '不回家' })
  h.values.set('care-selection-v1:synthetic-a', { id: 'profile-synthetic-a', familyId: 'new-family' })
  await port.resegment({ text: '不回家' })
  expect(new Set([requestKey(0), requestKey(1), requestKey(2)]).size).toBe(3)
})

test('retains caller identity on legacy requests and attaches no care headers to external URLs', async () => {
  await Taro.request({ url: 'https://api.example.test/api/gpt/communication/resegment', method: 'POST', header: { 'Idempotency-Key': 'same-request' } })
  expect(requestKey(0)).toBe('same-request')
  for (const url of ['https://api.example.test.attacker.invalid/api/gpt/communication/resegment', 'https://external.invalid/api/gpt/communication/resegment']) {
    await Taro.request({ url, method: 'POST', header: {} })
  }
  for (const [params] of h.transport.mock.calls.slice(1)) {
    expect(params.header['X-Care-Profile-Id']).toBeUndefined()
    expect(params.header['X-Care-Funding-Id']).toBeUndefined()
    expect(params.header['Idempotency-Key']).toBeUndefined()
  }
})
