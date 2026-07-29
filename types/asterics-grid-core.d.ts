declare module '@cboard-communication-core/astericsGrid' {
  export const ASTERICS_GRID_FILE_EXTENSION: 'grd'
  export const ASTERICS_GRID_MAX_TEXT_LENGTH: number

  export interface AstericsOpenBoardDocument {
    path: string
    board: {
      format: 'open-board-0.1'
      id: string
      name: string
      locale?: string
      grid?: {
        rows: number
        columns: number
        order: Array<Array<string | null>>
      }
      buttons: Array<Record<string, unknown>>
      images?: Array<Record<string, unknown>>
      sounds?: Array<Record<string, unknown>>
    }
  }

  export function convertAstericsGridToOpenBoardDocuments(input: {
    text: string
    fileName?: string
    locale?: string
  }): Promise<AstericsOpenBoardDocument[]>
}
