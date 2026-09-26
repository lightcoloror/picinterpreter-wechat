declare module '@cboard-communication-core/CarePanel' {
  import type { ComponentType } from 'react'
  const CarePanel: ComponentType<{ runtime: any; ui: any }>
  export default CarePanel
}
declare module '@cboard-communication-core/careErrors' {
  export function careErrorMessage(error: any): string
}
declare module '@cboard-communication-core/careBuiltinImages' {
  import type { BoardDTO } from '@cboard-communication-core/dto'
  export interface CareBuiltinImage { catalog: string; boardId: string; tileId: string }
  export function createCareBuiltinImages(boards: BoardDTO[]): {
    reference(source: string): CareBuiltinImage | null
    resolve(reference: CareBuiltinImage): string
  }
}
declare module '@cboard-communication-core/careSync' {
  export interface CareSnapshot {
    cursor: number
    locked: boolean
    permissions: string[]
    resources: Record<string, any>
    media: Record<string, any>
    queue: any[]
    conflicts: any[]
    relationship?: { role: string; defaultMode: string }
    entitlements?: { syncWrite: boolean; download: boolean; state: string }
  }
  export interface CareEngine {
    view(): CareSnapshot
    archive(): CareSnapshot
    init(): Promise<CareSnapshot>
    sync(options?: { skipMediaUploads?: boolean; automatic?: boolean }): Promise<CareSnapshot>
    edit(kind: string, id: string, value: unknown, action?: string): Promise<void>
    addMedia(value: any): Promise<void>
    importPreview(value: any): Promise<void>
    resolve(operationId: string, choice: string): Promise<void>
  }
  export function createCareSync(options: {
    accountId: string; familyId: string; profileId: string
    storage: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }
    request: (path: string, method: any, body?: any) => Promise<any>
    newId: () => string | Promise<string>
    currentAccount: () => string | undefined
    personalFavorites?: boolean
    changed?: () => void
  }): CareEngine
}
declare module '@cboard-communication-core/careProjection' {
  import type { CareEngine, CareSnapshot } from '@cboard-communication-core/careSync'
  import type { BoardDTO } from '@cboard-communication-core/dto'
  export function projectCareBoards(snapshot: CareSnapshot, image?: (asset: any) => string): BoardDTO[]
  export function queueCareBoards(engine: CareEngine, boards: BoardDTO[], readImage?: (source: string) => Promise<any>): Promise<void>
}
declare module '@cboard-communication-core/careMediaValues' {
  import type { CareEngine } from '@cboard-communication-core/careSync'
  export function encodeCareMedia(value: any, engine: CareEngine, readImage: (source: string) => Promise<any>): Promise<any>
  export function decodeCareMedia(value: any, media: Record<string, any>, image: (asset: any) => string): any
}
declare module '@cboard-communication-core/careFavoriteChanges' {
  export function sameCareFavoriteContent(left: object, right: object): boolean
  export function sameCareFavoriteList(left: object[], right: object[]): boolean
}
declare module '@cboard-communication-core/productLinks' {
  export function getProductLinks(env: Record<string, string | undefined>, parseUrl?: (value: string) => any): { support: string | null }
}
declare module 'url-parse' {
  export default class UrlParse {
    constructor(value: string, base?: string)
    protocol: string
    hostname: string
    username: string
    password: string
    href: string
  }
}
