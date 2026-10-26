declare module '@cboard-communication-core/pictogramSemantics' {
  export interface PictogramSemantics {
    schemaVersion: 1
    mappingVersion: string
    queryText: string
    lookupText: string
    sourceLanguage: string
    sourceLabels: string[]
    sourceDefinitions: string[]
    sourceCategories: string[]
    queryConceptId: string | null
    conceptId: string | null
    relation: 'conflict' | 'reviewed' | 'unverified'
    requiresReview: boolean
    candidateMatch?: 'strong' | 'approximate'
    candidateEvidence?: string
  }
  export const PICTOGRAM_SEMANTICS_VERSION: string
  export function getConceptEnglishQuery(token: string): string | null
  export function getPictogramSegmentationTerms(): string[]
  export function getSemanticCandidateQueries(token: string): string[]
  export function getSemanticCandidateHint(value: unknown): string | null
  export function assessPictogramCandidate(token: string, value: unknown): { eligible: boolean; tier: number | null; reason: string }
  export function rankPictogramCandidates<T>(token: string, values: T[], options?: {limit?: number}): T[]
  export function getPictogramConcept(token: string): { id: string; label: string; definition: string; englishQuery: string | null; reviewedArasaacIds: string[] } | null
  export function buildArasaacSemanticFields(token: string, query: string, locale: string, id: string | number, item?: Record<string, unknown>): {label: string; semantics: PictogramSemantics; labels: {zh: string[]; en: string[]}}
  export function normalizePictogramSemantics(value: unknown): PictogramSemantics | null
  export function isPictogramSemanticMatchAllowed(token: string, value: unknown): boolean
  export function isPictogramSearchCandidateRelevant(value: unknown): boolean
}
