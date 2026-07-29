declare module '@cboard-communication-core/accountPhone' {
  export const MAINLAND_CHINA_PHONE_PATTERN: RegExp
  export const MASKED_MAINLAND_CHINA_PHONE_PATTERN: RegExp

  export function normalizeMainlandChinaPhone(value: unknown): string
  export function isValidMainlandChinaPhone(value: unknown): boolean
  export function maskMainlandChinaPhone(value: unknown): string
  export function normalizeMaskedMainlandChinaPhone(value: unknown): string
}
