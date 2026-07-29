declare module '@cboard-communication-core/privateArchivePassphrase' {
  export const PRIVATE_ARCHIVE_MIN_PASSPHRASE_LENGTH: number
  export const PRIVATE_ARCHIVE_MAX_PASSPHRASE_LENGTH: number
  export function validatePrivateArchivePassphrase(
    value: unknown,
    confirmation?: unknown
  ):
    | { ok: true; passphrase: string }
    | { ok: false; code: string; message: string }
}

declare module '@cboard-communication-core/privateArchiveEncryption' {
  export class PrivateArchiveEncryptionError extends Error {
    code: string
  }
  export function encryptPrivateArchive(options: {
    data: Uint8Array | ArrayBuffer
    passphrase: string
    randomBytes: (length: number) => Uint8Array | Promise<Uint8Array>
  }): Promise<Uint8Array>
  export function decryptPrivateArchive(options: {
    data: Uint8Array | ArrayBuffer
    passphrase: string
  }): Promise<Uint8Array>
  export function isEncryptedPrivateArchive(
    data: Uint8Array | ArrayBuffer
  ): boolean
}
