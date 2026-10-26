declare module '@cboard-communication-core/careLocalMediaProjection' {
  import type { BoardDTO } from '@cboard-communication-core/dto'
  export interface CareLocalMediaScope { accountId: string; familyId: string; profileId: string }
  export function preserveCareLocalTileMedia(cloudBoards: BoardDTO[], localBoards: BoardDTO[], localScope: CareLocalMediaScope, projectionScope: CareLocalMediaScope): BoardDTO[]
  export function preserveCareLocalFavoriteMedia<T extends {id: string; output?: unknown[]}>(cloudItems: T[], localItems: T[], localScope: CareLocalMediaScope, projectionScope: CareLocalMediaScope): T[]
}
declare module '@cboard-communication-core/expressionPlaybackCoordinator' {
  import type { TileDTO } from '@cboard-communication-core/dto'
  interface Result { ok: boolean; message: string; reason?: 'invalid' | 'unavailable' | 'provider' | 'playback' | 'timeout' | 'stopped' | 'network' }
  interface Speech { speak(text: string, options?: {rate?: number}): Promise<Result>; stop(): void }
  interface Audio { play(source: string, options?: {rate?: number}): Promise<Result>; stop(): void }
  export function playExpressionSentence(options: {sentence: string; output: TileDTO[]; speechPort: Speech; audioPort: Audio; rate?: number; isCurrent?: () => boolean}): Promise<Result>
  export function stopExpressionPlayback(speech: Speech, audio: Audio): void
}
