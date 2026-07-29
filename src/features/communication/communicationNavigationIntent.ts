export type CommunicationUtilityView =
  | 'phrases'
  | 'history'
  | 'settings'
  | 'diagnostics'
  | 'emergency'

export interface CommunicationNavigationIntent {
  utilityView?: CommunicationUtilityView
  showCaregiverTools?: boolean
  reuseSavedPhraseId?: string
  expressionDraft?: Array<{ id: string; boardId: string }>
}

export interface CommunicationNavigationStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
}

const STORAGE_KEY = 'picinterpreter.communication.navigation-intent.v1'
const utilityViews = new Set<CommunicationUtilityView>([
  'phrases',
  'history',
  'settings',
  'diagnostics',
  'emergency'
])

function normalizeIntent(value: unknown): CommunicationNavigationIntent | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as CommunicationNavigationIntent
  const utilityView = utilityViews.has(candidate.utilityView as CommunicationUtilityView)
    ? candidate.utilityView
    : undefined
  const showCaregiverTools = candidate.showCaregiverTools === true
  const reuseSavedPhraseId =
    typeof candidate.reuseSavedPhraseId === 'string'
      ? candidate.reuseSavedPhraseId.trim().slice(0, 200)
      : ''
  const expressionDraft = (Array.isArray(candidate.expressionDraft)
    ? candidate.expressionDraft
    : [])
    .map(item => ({
      id: typeof item?.id === 'string' ? item.id.trim().slice(0, 200) : '',
      boardId:
        typeof item?.boardId === 'string'
          ? item.boardId.trim().slice(0, 200)
          : ''
    }))
    .filter(item => item.id)
    .slice(0, 12)

  if (
    !utilityView &&
    !showCaregiverTools &&
    !reuseSavedPhraseId &&
    !expressionDraft.length
  ) return null
  return {
    ...(utilityView ? { utilityView } : {}),
    ...(showCaregiverTools ? { showCaregiverTools: true } : {}),
    ...(reuseSavedPhraseId ? { reuseSavedPhraseId } : {}),
    ...(expressionDraft.length ? { expressionDraft } : {})
  }
}

export function createCommunicationNavigationIntentStore(
  storage: CommunicationNavigationStorage
) {
  return {
    save(intent: CommunicationNavigationIntent) {
      const normalized = normalizeIntent(intent)
      if (!normalized) {
        storage.removeStorageSync(STORAGE_KEY)
        return false
      }
      storage.setStorageSync(STORAGE_KEY, normalized)
      return true
    },
    take() {
      const intent = normalizeIntent(storage.getStorageSync(STORAGE_KEY))
      storage.removeStorageSync(STORAGE_KEY)
      return intent
    }
  }
}
