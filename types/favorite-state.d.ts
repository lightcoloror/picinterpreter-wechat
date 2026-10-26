declare module '@cboard-communication-core/favoriteState' {
  export const FAVORITE_STATE_KEY: string
  export interface FavoriteState { version: 1; generation: string; scope: string; revision: number; phrases: any[]; tombstones: any[]; pending: any }
  export function createFavoriteStateStore(storage: {
    getScopeKey?(): string; getItem(key: string): unknown; setItem(key: string, value: string): unknown;
    prepareFavoriteCommit?(before: FavoriteState, after: FavoriteState): any
  }): { read(): FavoriteState; commit(expected: FavoriteState, changes: Partial<FavoriteState>): FavoriteState }
}

declare module '@cboard-communication-core/repository' {
  import type { FavoriteState } from '@cboard-communication-core/favoriteState'
  export interface CommunicationRepository {
    readFavoriteState(): FavoriteState
    commitFavoriteState(expected: FavoriteState, changes: Partial<FavoriteState>): FavoriteState
  }
}
