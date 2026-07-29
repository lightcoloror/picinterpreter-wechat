import type {
  PictogramPortResult,
  PictogramSearchPort,
  PictogramSearchResult,
  RuntimePictogram
} from './pictogramSearchPort'

interface FallbackPictogramSearchOptions {
  primary: PictogramSearchPort
  fallback: PictogramSearchPort
  isFallbackPictogram: (pictogram: RuntimePictogram) => boolean
}

const OFFLINE_MESSAGE =
  'cboard-api 与 ARASAAC 直连均不可用，离线沟通不受影响。'

async function safeSearch(
  port: PictogramSearchPort,
  tokens: string[]
): Promise<PictogramPortResult<PictogramSearchResult[]>> {
  try {
    return await port.search(tokens)
  } catch (error) {
    return { ok: false, message: OFFLINE_MESSAGE }
  }
}

async function safeCache(
  port: PictogramSearchPort,
  pictogram: RuntimePictogram
): Promise<PictogramPortResult<RuntimePictogram>> {
  try {
    return await port.cache(pictogram)
  } catch (error) {
    return {
      ok: false,
      message: '图片缓存失败，候选仍保留，离线沟通不受影响。'
    }
  }
}

export function createFallbackPictogramSearchPort(
  options: FallbackPictogramSearchOptions
): PictogramSearchPort {
  const configured = options.primary.configured || options.fallback.configured

  return {
    configured,

    async search(tokens) {
      if (options.primary.configured) {
        const primaryResult = await safeSearch(options.primary, tokens)
        if (primaryResult.ok || !options.fallback.configured) {
          return primaryResult
        }

        const fallbackResult = await safeSearch(options.fallback, tokens)
        if (fallbackResult.ok) {
          return {
            ...fallbackResult,
            message: `cboard-api 暂时不可用，已改用 ARASAAC 直连。${fallbackResult.message}`
          }
        }

        return {
          ok: false,
          message: fallbackResult.message.includes('服务器域名')
            ? `cboard-api 暂时不可用；${fallbackResult.message}`
            : OFFLINE_MESSAGE
        }
      }

      if (options.fallback.configured) {
        return safeSearch(options.fallback, tokens)
      }

      return {
        ok: false,
        message: '在线补图尚未配置，离线沟通仍可正常使用。'
      }
    },

    async cache(pictogram) {
      if (options.isFallbackPictogram(pictogram)) {
        return options.fallback.configured
          ? safeCache(options.fallback, pictogram)
          : {
              ok: false,
              message: 'ARASAAC 直连尚未配置，候选图片未保存。'
            }
      }

      return options.primary.configured
        ? safeCache(options.primary, pictogram)
        : {
            ok: false,
            message: '当前候选来自 cboard-api，但服务地址未配置，未保存。'
          }
    }
  }
}
