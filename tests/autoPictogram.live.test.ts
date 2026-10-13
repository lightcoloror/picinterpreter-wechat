// Opt-in acceptance of existing ports with synthetic corpus only. No production
// switches or user stores are changed. Confirmation below is a test action,
// never a claim that a caregiver approved a candidate's meaning.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { test, expect } from 'vitest'
import { createArasaacPictogramSearchPort } from '../src/platform/arasaacPictogramSearchPort'
import { createPictogramSearchPort, type RuntimePictogram } from '../src/platform/pictogramSearchPort'
import { createFallbackPictogramSearchPort } from '../src/platform/fallbackPictogramSearchPort'
import { createWechatCommunicationRepository } from '../src/platform/communicationRepository'
import { buildReceiverLoopState, buildReceiverHistoryEntry, restoreReceiverLoopState } from '@cboard-communication-core/receiverPipeline'
import boards from '../../cboard/src/api/boards.json'
import messages from '../../cboard/src/translations/zh-CN.communication'

const enabled = process.env.TUYUJIA_LIVE_PICTOGRAM_ACCEPTANCE === '1'
test.skipIf(!enabled)('live synthetic search, simulated confirmation, disk cache and offline replay', async () => {
  const root = path.resolve('../../outputs/tuyujia-auto-pictogram-acceptance-20261012')
  const corpus = JSON.parse(fs.readFileSync(path.resolve('../../outputs/tuyujia-segmentation-refinement-20261012/results.json'), 'utf8'))
  for (const dir of ['responses', 'temp', 'cache']) fs.mkdirSync(path.join(root, dir), { recursive: true })
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2))
  const sha = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex')
  const intl = { messages, formatMessage: ({ id }: { id: string }) => (messages as Record<string, string>)[id] || id }
  let offline = false
  let calls = 0
  const requests: any[] = []
  const metadata = new Map<string, string[]>()
  const request = async (options: any) => {
    if (offline) throw new Error('TEST_NETWORK_DISABLED')
    calls++
    const started = Date.now()
    const log: any = { url: options.url, method: options.method, tokens: options.data?.tokens }
    try {
      const response = await fetch(options.url, { method: options.method, headers: options.header, body: options.data ? JSON.stringify(options.data) : undefined, signal: AbortSignal.timeout(8000) })
      const data = await response.json()
      log.status = response.status
      write(`responses/${sha(options.url + JSON.stringify(options.data || {}))}.json`, data)
      if (Array.isArray(data)) for (const item of data) {
        if (item?._id) metadata.set(String(item._id), (item.keywords || []).map((entry: any) => entry.keyword).filter(Boolean))
      }
      return { statusCode: response.status, data }
    } catch (error) {
      log.error = String(error)
      throw error
    } finally {
      log.elapsedMs = Date.now() - started
      requests.push(log)
      write('requests.json', requests)
    }
  }
  const downloadFile = async ({ url }: { url: string }) => {
    if (offline) throw new Error('TEST_NETWORK_DISABLED')
    calls++
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return { statusCode: response.status, tempFilePath: '' }
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    const tempFilePath = path.join(root, 'temp', `${sha(url)}.png`)
    fs.writeFileSync(tempFilePath, bytes)
    return { statusCode: 200, tempFilePath }
  }
  const saveFile = async ({ tempFilePath }: { tempFilePath: string }) => {
    const savedFilePath = path.join(root, 'cache', path.basename(tempFilePath))
    fs.copyFileSync(tempFilePath, savedFilePath)
    return { savedFilePath }
  }
  const port = createFallbackPictogramSearchPort({
    primary: createPictogramSearchPort({ apiBaseUrl: 'https://tuyujia.com.cn/api', request, downloadFile, saveFile }),
    fallback: createArasaacPictogramSearchPort({ request, downloadFile, saveFile }),
    isFallbackPictogram: picture => picture.image.startsWith('https://static.arasaac.org/')
  })
  const storagePath = path.join(root, 'synthetic-storage.json')
  fs.writeFileSync(storagePath, '{}')
  const storage = () => ({
    getStorageSync: (key: string) => JSON.parse(fs.readFileSync(storagePath, 'utf8'))[key] ?? '',
    setStorageSync: (key: string, value: unknown) => { const values = JSON.parse(fs.readFileSync(storagePath, 'utf8')); values[key] = value; fs.writeFileSync(storagePath, JSON.stringify(values)) },
    removeStorageSync: (key: string) => { const values = JSON.parse(fs.readFileSync(storagePath, 'utf8')); delete values[key]; fs.writeFileSync(storagePath, JSON.stringify(values)) }
  })
  const repository = createWechatCommunicationRepository(storage())
  const tokens = [...new Set<string>(corpus.rows.flatMap((row: any) => row.normal.unmatched))]
  repository.recordMissingTokens({ tokens, rawText: '', scene: 'receiver' })
  const candidates: Record<string, RuntimePictogram[]> = {}
  for (let offset = 0; offset < tokens.length; offset += 12) {
    const batch = tokens.slice(offset, offset + 12)
    const result = await port.search(batch)
    for (const token of batch) candidates[token] = (result.value || []).filter(item => item.token === token).map(item => item.pictogram)
    for (const record of repository.loadMissingTokens()) {
      const suggestions = candidates[record.normalizedToken]
      if (!suggestions?.length || record.status !== 'new') continue
      repository.reviewMissingToken(record.id, { status: 'suggested', suggestedPictogramId: suggestions[0].id, suggestedPictogram: suggestions[0], suggestedPictograms: suggestions, source: 'online:arasaac' })
    }
    write('candidates.json', candidates)
    write('progress.json', { stage: 'search', processed: Math.min(offset + 12, tokens.length), total: tokens.length })
    console.log(`searched ${Math.min(offset + 12, tokens.length)}/${tokens.length}`)
  }
  const suggestedRecords = repository.loadMissingTokens()
  // Merely finding suggestions must not make them active pictures.
  for (const row of corpus.rows) {
    const state = buildReceiverLoopState(row.text, boards.advanced, { intl, missingTokenRecords: suggestedRecords })
    expect(state.missingTokens.filter((token: string) => !/^[\s\p{P}]+$/u.test(token))).toEqual(row.normal.unmatched)
  }
  const cacheResults: any[] = []
  const hashes = new Map<string, string>()
  const first = Object.values(candidates).find(list => list.length)?.[0]
  expect(first).toBeDefined()
  offline = true
  expect((await port.cache(first!)).ok).toBe(false)
  offline = false
  for (const record of suggestedRecords) {
    const candidate = candidates[record.normalizedToken]?.[0]
    if (!candidate) continue
    // Test-only confirmation of first result for transport upper bound. No
    // first-result auto-confirm behaviour is added to the product.
    const cached = await port.cache(candidate)
    cacheResults.push({ token: record.normalizedToken, candidate, sourceKeywords: metadata.get(candidate.source.originalId) || [], confirmedBy: 'synthetic-test-action-not-caregiver', ok: cached.ok, cached: cached.value || null, message: cached.message })
    if (cached.ok && cached.value) {
      hashes.set(cached.value.image, sha(fs.readFileSync(cached.value.image)))
      repository.reviewMissingToken(record.id, { status: 'resolved', resolvedPictogramId: cached.value.id, resolvedPictogram: cached.value, source: `online:${cached.value.source.provider}` })
    }
    write('cache-results.json', cacheResults)
    write('progress.json', { stage: 'cache', processed: cacheResults.length })
    if (cacheResults.length % 12 === 0) console.log(`cached ${cacheResults.length}`)
  }
  // Reopen the actual repository from disk, prohibit all network adapters, and
  // restore saved receiver output against the same baseline picture catalog.
  offline = true
  const offlineCalls = calls
  const restored = createWechatCommunicationRepository(storage())
  const records = restored.loadMissingTokens()
  const rows = corpus.rows.map((row: any) => {
    const state = buildReceiverLoopState(row.text, boards.advanced, { intl, missingTokenRecords: records })
    expect(state.reviewItems.map((item: any) => item.token).join('')).toBe(row.text)
    const history = JSON.parse(JSON.stringify(buildReceiverHistoryEntry(row.text, state.reviewItems)))
    const replay = restoreReceiverLoopState(history, boards.advanced, { intl })!
    expect(replay.reviewItems.map((item: any) => item.token).join('')).toBe(row.text)
    const onlineItems = replay.reviewItems.filter((item: any) => item.matchType === 'online')
    for (const item of onlineItems) {
      expect(sha(fs.readFileSync(item.tile!.tile.image!))).toBe(hashes.get(item.tile!.tile.image!))
    }
    const remaining = state.missingTokens.filter((token: string) => !/^[\s\p{P}]+$/u.test(token))
    return { id: row.id, text: row.text, beforeMissing: row.normal.unmatched, candidateCovered: row.normal.unmatched.every((token: string) => candidates[token]?.length), afterTechnicalMissing: remaining, offlinePictures: onlineItems.length }
  })
  expect(calls).toBe(offlineCalls)
  const summary = {
    scope: '213 synthetic sentences, live search and PNG downloads; existing core/repository; disk adapters replace WeChat filesystem; synthetic confirmation of first candidate is not semantic acceptance',
    createdAt: new Date().toISOString(), sentences: rows.length, uniqueMissingTokens: tokens.length,
    beforeFullyPictured: corpus.summary.normalFullyPictured,
    tokensWithCandidates: tokens.filter(token => candidates[token]?.length).length,
    candidateFullyCoveredSentences: rows.filter(row => row.candidateCovered).length,
    attemptedCacheTokens: cacheResults.length, cachedTokens: cacheResults.filter(result => result.ok).length,
    afterSimulatedConfirmationFullyPictured: rows.filter(row => !row.afterTechnicalMissing.length).length,
    offlinePictureOccurrences: rows.reduce((sum, row) => sum + row.offlinePictures, 0),
    uniqueOfflineFiles: hashes.size, offlineNetworkCalls: calls - offlineCalls,
    semanticCaregiverConfirmed: 0, noImplicitCandidateAcceptance: true, failedOfflineCacheLeftUnconfirmed: true,
    primaryStatuses: [...new Set(requests.filter(item => item.url.includes('tuyujia.com.cn')).map(item => item.status))]
  }
  write('results.json', { summary, rows, unresolvedTokens: tokens.filter(token => !candidates[token]?.length), sourceCorpus: '../../tuyujia-segmentation-refinement-20261012/results.json', sourceHashes: Object.fromEntries(['src/platform/arasaacPictogramSearchPort.ts', 'src/platform/pictogramSearchPort.ts', 'src/platform/fallbackPictogramSearchPort.ts', 'src/platform/communicationRepository.ts'].map(file => [file, sha(fs.readFileSync(file))])) })
  write('progress.json', { stage: 'complete', summary })
  console.log(JSON.stringify(summary))
}, 600000)
