import UrlParse from 'url-parse'
import { getProductLinks } from '@cboard-communication-core/productLinks'

export function productSupportTarget(url = process.env.TARO_APP_SUPPORT_URL, email = process.env.TARO_APP_SUPPORT_EMAIL) {
  // Reuse Web validation, with the installed parser rather than assuming a
  // browser URL constructor exists in the mini-program runtime.
  const { support } = getProductLinks({ REACT_APP_CARE_COLLABORATION: 'true',
    REACT_APP_SUPPORT_URL: url, REACT_APP_SUPPORT_EMAIL: email }, value => new UrlParse(value, ''))
  if (!support) return null
  return support.startsWith('mailto:')
    ? { kind: 'email' as const, value: support.slice(7) }
    : { kind: 'link' as const, value: support }
}
