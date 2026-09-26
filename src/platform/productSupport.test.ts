import { expect, test } from 'vitest'
import { productSupportTarget } from './productSupport'

test('reuses a configured HTTPS support link or explicit email without upstream defaults', () => {
  expect(productSupportTarget('', '')).toBeNull()
  expect(productSupportTarget('https://support.example.test/form', '')).toEqual({ kind: 'link', value: 'https://support.example.test/form' })
  expect(productSupportTarget('', 'help@example.test')).toEqual({ kind: 'email', value: 'help@example.test' })
})

test.each(['http://support.example.test', 'javascript:alert(1)', 'https://user:password@example.test', 'https://cboard.io/help', 'https://support.cboard.io/help', '/relative'])('rejects invalid or upstream support destination %s', url => {
  expect(productSupportTarget(url, '')).toBeNull()
})

test('rejects upstream and header-injection emails and permits an explicit email fallback', () => {
  expect(productSupportTarget('', 'support@cboard.io')).toBeNull()
  expect(productSupportTarget('', 'help@example.test\nBcc:other@example.test')).toBeNull()
  expect(productSupportTarget('http://invalid.test', 'help@example.test')?.kind).toBe('email')
})
