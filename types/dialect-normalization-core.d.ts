declare module '@cboard-communication-core/dialectNormalization' {
  export type CommunicationDialect = 'cantonese'

  export interface CommunicationDialectDefinition {
    id: CommunicationDialect
    label: string
    browserLanguage: string
  }

  export interface DialectNormalizationRequest {
    contractVersion: 1
    text: string
    dialect: CommunicationDialect | null
    pictogramVocabulary: string[]
  }

  export interface DialectNormalizationResult {
    sourceText: string
    normalizedText: string
    dialect: CommunicationDialect
    provider: string
    sourceStored: false
    changed: boolean
  }

  export const DIALECT_NORMALIZATION_CONTRACT_VERSION: 1
  export const MAX_DIALECT_NORMALIZATION_TEXT_LENGTH: 120
  export const MAX_DIALECT_NORMALIZATION_VOCABULARY: 200
  export const COMMUNICATION_DIALECTS: Readonly<
    Record<CommunicationDialect, Readonly<CommunicationDialectDefinition>>
  >

  export function normalizeCommunicationDialect(
    value: unknown
  ): CommunicationDialect | null

  export function normalizeDialectText(value: unknown): string

  export function buildLocalDialectNormalization(
    text: unknown,
    dialect?: CommunicationDialect
  ): DialectNormalizationResult | null

  export function buildDialectNormalizationRequest(input?: {
    text?: unknown
    dialect?: CommunicationDialect
    pictogramVocabulary?: unknown[]
  }): DialectNormalizationRequest

  export function normalizeDialectNormalizationResponse(
    value: unknown,
    expected?: {
      sourceText?: unknown
      dialect?: CommunicationDialect
    }
  ): DialectNormalizationResult | null
}
