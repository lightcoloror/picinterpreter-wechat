declare module '@cboard-communication-core/localDeviceData' {
  import type { PictureLibraryArchiveManifest } from '@cboard-communication-core/pictureLibraryArchive'
  import type {
    CommunicationHistoryEntry,
    CommunicationSavedPhraseEntry,
    CommunicationSavedPhraseTombstone,
    MissingTokenRecord,
    ReceiverCorrectionEntry
  } from '@cboard-communication-core/repository'
  import type { ExpressionCandidateFeedbackDraft } from '@cboard-communication-core/candidateFeedback'
  import type { PersonalImagePreference } from '@cboard-communication-core/personalImagePreferences'

  export const LOCAL_DEVICE_DATA_FORMAT: 'picinterpreter-local-device-data'
  export const LOCAL_DEVICE_DATA_VERSION: 1
  export const LOCAL_DEVICE_DATA_MANIFEST: 'device-data.json'
  export const LOCAL_DEVICE_DATA_PICTOGRAMS: 'pictograms.json'
  export const LOCAL_DEVICE_DATA_CATEGORIES: 'categories.json'
  export const LOCAL_DEVICE_DATA_EXPRESSIONS: 'expressions.json'
  export const LOCAL_DEVICE_DATA_PURPOSES: Readonly<{
    completeDeviceBackup: 'complete-device-backup'
    accountPrivateSnapshot: 'account-private-snapshot'
  }>

  export type LocalDeviceDataPurpose =
    | 'complete-device-backup'
    | 'account-private-snapshot'

  export interface LocalDeviceDataFiles {
    manifest: {
      format: 'picinterpreter-local-device-data'
      version: 1
      createdAt: number
      sourcePlatform: string
      purpose: LocalDeviceDataPurpose
      libraryManifest: 'library.json'
      files: {
        pictograms: 'pictograms.json'
        categories: 'categories.json'
        expressions: 'expressions.json'
      }
      stats: {
        pictogramCount: number
        categoryCount: number
        expressionCount: number
        savedPhraseCount: number
        savedPhraseTombstoneCount?: number
        correctionCount: number
        draftCount: number
      }
    }
    files: Record<string, unknown>
  }

  export function buildLocalDeviceDataFiles(options: {
    libraryManifest: PictureLibraryArchiveManifest
    savedPhrases?: CommunicationSavedPhraseEntry[]
    savedPhraseTombstones?: CommunicationSavedPhraseTombstone[]
    history?: CommunicationHistoryEntry[]
    receiverRecords?: CommunicationHistoryEntry[]
    receiverCorrections?: ReceiverCorrectionEntry[]
    expressionCandidateFeedbackDrafts?: unknown[]
    purpose?: LocalDeviceDataPurpose
    sourcePlatform?: string
    createdAt?: number
  }): LocalDeviceDataFiles

  export interface NormalizedLocalDeviceDataArchive {
    manifest: LocalDeviceDataFiles['manifest']
    pictograms: {
      format: 'picinterpreter-local-device-data'
      version: 1
      createdAt: number
      items: unknown[]
    }
    categories: {
      format: 'picinterpreter-local-device-data'
      version: 1
      createdAt: number
      items: unknown[]
    }
    expressions: {
      format: 'picinterpreter-local-device-data'
      version: 1
      createdAt: number
      savedPhrases: CommunicationSavedPhraseEntry[]
      savedPhraseTombstones: CommunicationSavedPhraseTombstone[]
      history: CommunicationHistoryEntry[]
      receiverRecords: CommunicationHistoryEntry[]
      receiverCorrections: ReceiverCorrectionEntry[]
      expressionCandidateFeedbackDrafts: ExpressionCandidateFeedbackDraft[]
    }
  }

  export function normalizeLocalDeviceDataArchiveFiles(options: {
    manifest: unknown
    pictograms: unknown
    categories: unknown
    expressions: unknown
    libraryManifest?: PictureLibraryArchiveManifest
  }): NormalizedLocalDeviceDataArchive

  export interface LocalDeviceDataRestoreState {
    savedPhrases: CommunicationSavedPhraseEntry[]
    savedPhraseTombstones: CommunicationSavedPhraseTombstone[]
    history: CommunicationHistoryEntry[]
    receiverRecords: CommunicationHistoryEntry[]
    receiverCorrections: ReceiverCorrectionEntry[]
    expressionCandidateFeedbackDrafts: ExpressionCandidateFeedbackDraft[]
  }

  export function mergeLocalDeviceDataRestore(options: {
    current?: Partial<LocalDeviceDataRestoreState>
    imported:
      | NormalizedLocalDeviceDataArchive
      | NormalizedLocalDeviceDataArchive['expressions']
    identity?: {
      patientId?: string
      workspaceId?: string
    }
    conflictStrategy?: 'merge' | 'skip'
  }): LocalDeviceDataRestoreState

  export function buildPrivatePictogramClearPlan(options: {
    personalImagePreferences?: PersonalImagePreference[]
    missingTokens?: MissingTokenRecord[]
    now?: number
  }): {
    personalImagePreferences: PersonalImagePreference[]
    missingTokens: MissingTokenRecord[]
    imageSources: string[]
    removedPreferenceCount: number
    removedRuntimePictogramCount: number
  }
}
