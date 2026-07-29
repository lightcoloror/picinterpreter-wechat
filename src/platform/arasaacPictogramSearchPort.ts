import { getReviewedArasaacIds } from '@cboard-communication-core/reviewedArasaac'

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
const ARASAAC_BEST_SEARCH_BASE =
  `${ARASAAC_API_ORIGIN}/v1/pictograms/zh/bestsearch`
const ARASAAC_SEARCH_BASE = `${ARASAAC_API_ORIGIN}/v1/pictograms/zh/search`
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
    .slice(0, MAX_CANDIDATES_PER_TOKEN)
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

function buildArasaacPictogram(token: string, id: string): RuntimePictogram {
  return {
    id: `runtime_arasaac_${id}`,
    label: token,
    vocalization: token,
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

  return buildArasaacPictogram(
    String(value.label || value.vocalization || '').trim(),
    id
  )
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

        for (const searchBase of [
          ARASAAC_BEST_SEARCH_BASE,
          ARASAAC_SEARCH_BASE
        ]) {
          try {
            const response = await dependencies.request({
              url: `${searchBase}/${encodeURIComponent(token)}`,
              method: 'GET',
              header: { Accept: 'application/json' }
            })
            if (response.statusCode < 200 || response.statusCode >= 300) {
              networkFailed = true
              if (reviewedIds.length) break
              continue
            }

            const liveIds = getPictogramIds(response.data)
            if (liveIds.length) {
              candidateIds = getPictogramIds(response.data, reviewedIds)
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
          candidateIds = getPictogramIds([], reviewedIds)
        }
        if (reviewedIds.length && candidateIds.length) {
          usedReviewedPriority = true
        }

        candidateIds.forEach(id => {
          results.push({
            token,
            pictogram: buildArasaacPictogram(token, id)
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
