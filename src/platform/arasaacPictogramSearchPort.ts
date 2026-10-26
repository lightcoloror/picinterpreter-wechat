import { currentImageOperationEpoch } from '@cboard-communication-core/imageOperationEpoch'
import { getReviewedArasaacIds } from '@cboard-communication-core/reviewedArasaac'
import { buildArasaacSemanticFields, normalizePictogramSemantics, rankPictogramCandidates, getConceptEnglishQuery, getSemanticCandidateQueries } from '@cboard-communication-core/pictogramSemantics'

import type {
  PictogramPortResult,
  PictogramSearchPort,
  PictogramSearchResult,
  RuntimePictogram
} from './pictogramSearchPort'

interface ArasaacRequestResult {
  statusCode: number
  data: unknown
}

interface ArasaacDownloadResult {
  statusCode: number
  tempFilePath: string
}

interface ArasaacSaveResult {
  savedFilePath: string
}

interface ArasaacPictogramSearchDependencies {
  verifyImage?: (source: string) => Promise<{ status: string }>
  request: (options: {
    url: string
    method: 'GET'
    header: Record<string, string>
  }) => Promise<ArasaacRequestResult>
  downloadFile: (options: { url: string }) => Promise<ArasaacDownloadResult>
  saveFile: (options: { tempFilePath: string }) => Promise<ArasaacSaveResult>
}

const ARASAAC_API_ORIGIN = 'https://api.arasaac.org'
const ARASAAC_STATIC_ORIGIN = 'https://static.arasaac.org'
const MAX_SEARCH_TOKENS = 12
const MAX_TOKEN_LENGTH = 24
const MAX_CANDIDATES_PER_TOKEN = 4

function normalizeTokens(tokens: string[]) {
  const seen = new Set<string>()

  return (Array.isArray(tokens) ? tokens : [])
    .map(token => String(token || '').trim())
    .filter(token => {
      if (!token || token.length > MAX_TOKEN_LENGTH || seen.has(token)) {
        return false
      }
      seen.add(token)
      return true
    })
    .slice(0, MAX_SEARCH_TOKENS)
}

function getPictogramIds(value: unknown, prioritizedIds: number[] = []) {
  const seen = new Set<string>()
  return [
    ...prioritizedIds,
    ...(Array.isArray(value) ? value : [])
  ]
    .map(item => {
      if (typeof item === 'number' || typeof item === 'string') {
        return String(item).trim()
      }
      const raw =
        item && typeof item === 'object'
          ? item as Record<string, unknown>
          : {}
      return String(raw._id || raw.id || '').trim()
    })
    .filter(id => {
      if (
        !/^\d{1,12}$/.test(id) ||
        Number(id) <= 0 ||
        seen.has(id)
      ) {
        return false
      }
      seen.add(id)
      return true
    })
}

function isWechatDomainBlocked(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const message = String(
    (error as { errMsg?: unknown; message?: unknown }).errMsg ||
      (error as { message?: unknown }).message ||
      ''
  ).toLocaleLowerCase()
  return (
    message.includes('domain list') ||
    message.includes('合法域名') ||
    message.includes('url not in domain')
  )
}

function buildArasaacPictogram(token: string, id: string, item: Record<string, unknown> = {}, query = token, locale = 'zh'): RuntimePictogram {
  const fields = buildArasaacSemanticFields(token, query, locale, id, item)
  return {
    id: `runtime_arasaac_${id}`,
    label: fields.label,
    vocalization: fields.label,
    semantics: fields.semantics,
    image: `${ARASAAC_STATIC_ORIGIN}/pictograms/${id}/${id}_300.png`,
    backgroundColor: '#ffffff',
    source: {
      provider: 'arasaac',
      originalId: id,
      name: 'ARASAAC',
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      author: 'Sergio Palao',
      authorUrl: 'https://arasaac.org/',
      sourceUrl: `https://arasaac.org/pictograms/${id}`,
      repoKey: 'arasaac'
    }
  }
}

function normalizeTrustedCandidate(value: RuntimePictogram) {
  if (!value || !value.source || value.source.provider !== 'arasaac') {
    return null
  }

  const id = String(value.source.originalId || '').trim()
  if (!/^\d{1,12}$/.test(id) || Number(id) <= 0) return null

  const expectedImage =
    `${ARASAAC_STATIC_ORIGIN}/pictograms/${id}/${id}_300.png`
  if (value.image !== expectedImage) return null

  const normalized = buildArasaacPictogram(
    String(value.label || value.vocalization || '').trim(),
    id
  )
  const semantics = normalizePictogramSemantics(value.semantics)
  // A legacy label is not evidence of its original lookup or source meaning.
  delete normalized.semantics
  return { ...normalized, label: value.label, vocalization: value.vocalization,
    ...(semantics ? { semantics } : {}) }
}

export function createArasaacPictogramSearchPort(
  dependencies: ArasaacPictogramSearchDependencies
): PictogramSearchPort {
  return {
    configured: true,

    async search(tokens) {
      const queryTokens = normalizeTokens(tokens)
      if (!queryTokens.length) {
        return { ok: true, message: '没有需要搜索的缺词。', value: [] }
      }

      const results: PictogramSearchResult[] = []
      let networkFailed = false
      let domainBlocked = false
      let usedReviewedPriority = false

      for (const token of queryTokens) {
        const reviewedIds = getReviewedArasaacIds(token)
        let candidateIds: string[] = []
        let sourceItems: Record<string, unknown>[] = []
        let sourceQuery = token
        let sourceLocale = 'zh'
        const semanticPictures = new Map<string, RuntimePictogram>()
        const completedSemanticQueries = new Set<string>()
        const englishQuery = getConceptEnglishQuery(token)
        // Reuse the same qualified concepts as the server. Never translate a
        // missing word into a broad object label or adopt a search hit directly.
        const lookups = [{query: token, locale: 'zh', semantic: false},
          ...(englishQuery ? [{query: englishQuery, locale: 'en', semantic: false}] : []),
          ...getSemanticCandidateQueries(token).map(query => ({query, locale: 'en', semantic: true}))]

        for (const lookup of lookups.flatMap(item => ['bestsearch', 'search'].map(endpoint => ({...item, endpoint})))) {
          if (lookup.semantic && completedSemanticQueries.has(lookup.query)) continue
          try {
            const response = await dependencies.request({
              url: `${ARASAAC_API_ORIGIN}/v1/pictograms/${lookup.locale}/${lookup.endpoint}/${encodeURIComponent(lookup.query)}`,
              method: 'GET',
              header: { Accept: 'application/json' }
            })
            if (response.statusCode < 200 || response.statusCode >= 300) {
              // ARASAAC uses 404 for no matches; this is not a network outage.
              if (response.statusCode !== 404) networkFailed = true
              if (reviewedIds.length) break
              continue
            }

            sourceItems = (Array.isArray(response.data) ? response.data : [])
              .filter(item => item && typeof item === 'object')
            const liveIds = rankPictogramCandidates(token, getPictogramIds(response.data, reviewedIds).map(id =>
              buildArasaacPictogram(token, id,
                sourceItems.find(item => String(item._id || item.id) === id) || {}, lookup.query, lookup.locale)
            ), { limit: MAX_CANDIDATES_PER_TOKEN }).map(item => item.source.originalId)
            if (liveIds.length) {
              if (lookup.semantic) {
                liveIds.forEach(id => {
                  if (!semanticPictures.has(id)) semanticPictures.set(id, buildArasaacPictogram(token, id,
                    sourceItems.find(item => String(item._id || item.id) === id) || {}, lookup.query, lookup.locale))
                })
                completedSemanticQueries.add(lookup.query)
                candidateIds = [...semanticPictures.keys()]
                continue
              }
              candidateIds = liveIds
              sourceQuery = lookup.query
              sourceLocale = lookup.locale
              break
            }
            if (reviewedIds.length) break
          } catch (error) {
            if (isWechatDomainBlocked(error)) {
              domainBlocked = true
            } else {
              networkFailed = true
            }
            if (reviewedIds.length) break
          }
        }

        if (!candidateIds.length && reviewedIds.length) {
          candidateIds = rankPictogramCandidates(token, getPictogramIds([], reviewedIds).map(id =>
            buildArasaacPictogram(token, id)
          ), { limit: MAX_CANDIDATES_PER_TOKEN }).map(item => item.source.originalId)
        }
        if (reviewedIds.length && candidateIds.length) {
          usedReviewedPriority = true
        }

        rankPictogramCandidates(token, candidateIds.map(id => semanticPictures.get(id) || buildArasaacPictogram(token, id,
          sourceItems.find(item => String(item._id || item.id) === id) || {}, sourceQuery, sourceLocale)),
          { limit: MAX_CANDIDATES_PER_TOKEN }).forEach(pictogram => {
          results.push({
            token,
            pictogram
          })
        })
      }

      if (!results.length && domainBlocked) {
        return {
          ok: false,
          message:
            '请先在小程序“开发设置 → 服务器域名”中配置 ARASAAC 的 request 与 downloadFile 域名；离线沟通不受影响。'
        }
      }

      if (!results.length && networkFailed) {
        return {
          ok: false,
          message: '在线图片服务不可用，已保留离线沟通功能。'
        }
      }

      return {
        ok: true,
        message: results.length && domainBlocked
          ? usedReviewedPriority
            ? 'ARASAAC 搜索域名未配置；已返回内置人工审核候选，请配置 request 与 downloadFile 域名并确认图片显示。'
            : '部分 ARASAAC 搜索被服务器域名配置拦截；已返回其他可用候选，请照护者确认。'
          : results.length && networkFailed
            ? usedReviewedPriority
              ? 'ARASAAC 在线搜索部分不可用，已返回可用候选（含人工审核候选），请照护者确认。'
              : 'ARASAAC 排序搜索暂时不可用，已返回兼容搜索候选，请照护者确认。'
            : results.length && usedReviewedPriority
              ? '已优先使用原图语家人工审核候选，请照护者确认。'
              : results.length
                ? '已从 ARASAAC 找到候选图，请照护者确认。'
                : '暂时没有找到合适图片。',
        value: results
      }
    },

    async cache(pictogram) {
      const epoch = currentImageOperationEpoch()
      const normalized = normalizeTrustedCandidate(pictogram)
      if (!normalized) {
        return { ok: false, message: '候选图片来源无效，未保存。' }
      }

      try {
        const downloaded = await dependencies.downloadFile({
          url: normalized.image
        })
        if (
          downloaded.statusCode < 200 ||
          downloaded.statusCode >= 300 ||
          !downloaded.tempFilePath
        ) {
          return { ok: false, message: '候选图片下载失败，请稍后重试。' }
        }

        const saved = await dependencies.saveFile({
          tempFilePath: downloaded.tempFilePath
        })
        if (!saved.savedFilePath) {
          return { ok: false, message: '候选图片无法保存到本机。' }
        }

        if (!dependencies.verifyImage || (await dependencies.verifyImage(saved.savedFilePath)).status !== 'available') {
          return { ok: false, message: '图片文件未通过本机读取和解码核验，尚未采用，请重试。' }
        }

        if (epoch !== currentImageOperationEpoch()) return { ok: false, message: '操作范围已变化，图片未采用。' }
        return {
          ok: true,
          message: '图片已确认并保存到本机。',
          value: { ...normalized, image: saved.savedFilePath }
        }
      } catch (error) {
        return {
          ok: false,
          message: '图片缓存失败，离线沟通不受影响。'
        }
      }
    }
  }
}

export type ArasaacSearchResult =
  PictogramPortResult<PictogramSearchResult[]>
