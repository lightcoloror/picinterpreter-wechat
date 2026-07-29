declare module '@cboard-communication-core/pictureLibraryArchive' {
  import type { BoardDTO } from '@cboard-communication-core/dto'
  import type { PersonalImagePreference } from '@cboard-communication-core/personalImagePreferences'
  import type { MissingTokenRecord } from '@cboard-communication-core/repository'
  import type { PictogramOrderingState } from '@cboard-communication-core/pictogramOrdering'

  export type PictureLibraryArchiveScope = 'custom' | 'full'
  export type PictureLibraryConflictStrategy = 'merge' | 'skip'
  export type PictureLibraryProgressPhase =
    | 'collecting'
    | 'compressing'
    | 'reading'
    | 'restoring'
    | 'complete'

  export interface PictureLibraryProgress {
    phase: PictureLibraryProgressPhase
    completed: number
    total: number
    percent: number
    detail: string
  }

  export interface PictureLibraryArchiveAsset {
    path: string
    mediaType: string
    size: number
  }

  export interface PictureLibraryArchiveManifest {
    format: 'picinterpreter-picture-library'
    version: 1
    scope: PictureLibraryArchiveScope
    createdAt: number
    sourcePlatform: string
    boards: unknown[]
    personalImagePreferences: unknown[]
    missingTokenResolutions: unknown[]
    orderingState: PictogramOrderingState
    assets: PictureLibraryArchiveAsset[]
    stats: {
      boardCount: number
      tileCount: number
      customPictureCount: number
      assetCount: number
      pictureAssetCount: number
      soundAssetCount: number
      videoAssetCount: number
    }
  }

  export const PICTURE_LIBRARY_ARCHIVE_FORMAT: 'picinterpreter-picture-library'
  export const PICTURE_LIBRARY_ARCHIVE_VERSION: 1
  export const PICTURE_LIBRARY_ARCHIVE_MANIFEST: 'library.json'
  export const PICTURE_LIBRARY_ARCHIVE_SCOPES: {
    custom: 'custom'
    full: 'full'
  }
  export const PICTURE_LIBRARY_CONFLICT_STRATEGIES: {
    merge: 'merge'
    skip: 'skip'
  }
  export const PICTURE_LIBRARY_PROGRESS_PHASES: {
    collecting: 'collecting'
    compressing: 'compressing'
    reading: 'reading'
    restoring: 'restoring'
    complete: 'complete'
  }

  export function createPictureLibraryArchivePlan(options: {
    scope: PictureLibraryArchiveScope
    boards: BoardDTO[]
    personalImagePreferences: PersonalImagePreference[]
    missingTokens: MissingTokenRecord[]
    orderingState: PictogramOrderingState
    sourcePlatform?: string
    createdAt?: number
  }): {
    manifest: PictureLibraryArchiveManifest
    assets: Array<{
      path: string
      source: string
      mediaKind: 'image' | 'sound' | 'video'
    }>
  }

  export function normalizePictureLibraryArchiveManifest(
    value: unknown
  ): PictureLibraryArchiveManifest

  export function updatePictureLibraryArchiveAssetMetadata(
    manifest: PictureLibraryArchiveManifest,
    assets: PictureLibraryArchiveAsset[]
  ): PictureLibraryArchiveManifest

  export function createPictureLibraryProgress(
    phase: PictureLibraryProgressPhase,
    completed: number,
    total: number,
    detail?: string
  ): PictureLibraryProgress

  export function restorePictureLibraryArchive(options: {
    manifest: PictureLibraryArchiveManifest
    assetLocations: Record<string, string>
    existingBoards: BoardDTO[]
    existingPersonalImagePreferences: PersonalImagePreference[]
    existingMissingTokens: MissingTokenRecord[]
    existingOrderingState: PictogramOrderingState
    identity: { patientId: string; workspaceId: string }
    conflictStrategy: PictureLibraryConflictStrategy
  }): {
    archive: PictureLibraryArchiveManifest
    boards: BoardDTO[]
    personalImagePreferences: PersonalImagePreference[]
    missingTokens: MissingTokenRecord[]
    orderingState: PictogramOrderingState
    summary: PictureLibraryArchiveManifest['stats'] & {
      scope: PictureLibraryArchiveScope
      conflictStrategy: PictureLibraryConflictStrategy
    }
  }
}
