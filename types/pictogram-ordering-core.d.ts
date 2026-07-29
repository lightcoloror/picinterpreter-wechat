declare module '@cboard-communication-core/pictogramOrdering' {
  import type { TileDTO } from '@cboard-communication-core/dto'

  export type PictogramSortMode = 'manual' | 'popularity'
  export interface PictogramUsageRecord {
    count: number
    lastUsedAt: number
  }
  export interface PictogramOrderingState {
    schemaVersion: 1
    manualOrderByBoard: Record<string, string[]>
    usageByTileKey: Record<string, PictogramUsageRecord>
  }

  export function getPictogramTileKey(
    boardId: string,
    tileId: string
  ): string
  export function getManualPictogramOrder(
    tiles: TileDTO[],
    state: PictogramOrderingState,
    boardId: string
  ): string[]
  export function sortPictogramsForDisplay(
    tiles: TileDTO[],
    mode: PictogramSortMode,
    state: PictogramOrderingState,
    boardId: string
  ): TileDTO[]
}

declare module '@cboard-communication-core/pictogramOrderingStore' {
  import type { TileDTO } from '@cboard-communication-core/dto'
  import type {
    PictogramOrderingState
  } from '@cboard-communication-core/pictogramOrdering'

  export function createPictogramOrderingStore(storage: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
  }): {
    load(): PictogramOrderingState
    save(value: PictogramOrderingState): PictogramOrderingState
    recordUsage(
      boardId: string,
      tileId: string,
      now?: number
    ): PictogramOrderingState
    moveManualOrder(
      tiles: TileDTO[],
      boardId: string,
      tileId: string,
      direction: 'up' | 'down'
    ): PictogramOrderingState
  }
}
