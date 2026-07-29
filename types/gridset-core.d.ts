declare module '@cboard-communication-core/gridset' {
  export const GRIDSET_FILE_EXTENSION: 'gridset'

  export interface GridsetOpenBoardDocument {
    path: string
    board: unknown
  }

  export interface GridsetZipArchive {
    listFiles(): string[]
    readFile(name: string): Promise<Uint8Array | ArrayBuffer>
  }

  export type GridsetZipAdapter = (
    input: Uint8Array | ArrayBuffer
  ) => Promise<GridsetZipArchive>

  export function convertGridsetToOpenBoardDocuments(input: {
    data: Uint8Array | ArrayBuffer
    fileName?: string
    locale?: string
    zipAdapter: GridsetZipAdapter
  }): Promise<GridsetOpenBoardDocument[]>
}
