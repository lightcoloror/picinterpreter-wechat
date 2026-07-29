declare module '@cboard-communication-core/publicBoardPublication' {
  import type { BoardDTO } from '@cboard-communication-core/dto'

  export interface PublicBoardPublicationDeclaration {
    author: string
    description?: string
    licenseId?: 'cc-by-4.0'
    rightsConfirmed: boolean
    privacyConfirmed: boolean
  }

  export interface PublicBoardPublicationAsset {
    key: string
    kind: 'image' | 'video' | 'sound'
    source: string
  }

  export interface PublicBoardPublicationPlan {
    version: 1
    rootBoardId: string
    boards: BoardDTO[]
    boardCount: number
    tileCount: number
    assets: PublicBoardPublicationAsset[]
    declaration: PublicBoardPublicationDeclaration & {
      licenseId: 'cc-by-4.0'
    }
  }

  export const PUBLIC_BOARD_PUBLICATION_LICENSE: {
    id: 'cc-by-4.0'
    name: 'CC BY 4.0'
    url: string
  }

  export function createPublicBoardPublicationPlan(
    boards: BoardDTO[],
    rootBoardId: string,
    declaration: PublicBoardPublicationDeclaration
  ): PublicBoardPublicationPlan

  export function buildPrivatePublicBoardDraft(
    board: BoardDTO,
    declaration: PublicBoardPublicationDeclaration,
    email: string
  ): Record<string, unknown>

  export function buildPublishedPublicBoards(
    plan: PublicBoardPublicationPlan,
    values: {
      boardIds: Map<string, string> | Record<string, string>
      assetUrls: Map<string, string> | Record<string, string>
      email: string
    }
  ): Array<Record<string, unknown> & { id: string }>
}

