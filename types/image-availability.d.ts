declare module '@cboard-communication-core/imageAvailability' {
  export type ImageAvailabilityStatus = 'available' | 'unverified' | 'remote-only' | 'temporary' | 'missing' | 'corrupt' | 'check-failed'
  export interface ImageAvailability { status: ImageAvailabilityStatus; width?: number; height?: number }
  export function classifyImageReference(source: string, userDataPath?: string): string
  export function imageAvailabilityMessage(result: ImageAvailability): string
  export function requireAvailableImage(result: ImageAvailability): ImageAvailability
}
declare module '@cboard-communication-core/imageOperationEpoch' {
  export function currentImageOperationEpoch(): number
  export function invalidateImageOperations(): void
}
declare module '@cboard-communication-core/imageRepair' {
  export function repairCatalogImage<T>(candidate:T,tile:unknown):T
  export function originalPublicImagePath(tile: unknown): string
  export function createImageRepairOperation(): {
    cancel(): void
    prepare<T>(key: string, work: () => Promise<T>): Promise<T | null>
  }
}
