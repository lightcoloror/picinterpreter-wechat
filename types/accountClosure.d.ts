declare module '@cboard-communication-core/accountClosure' {
  type CboardClosurePreview = import('../src/platform/cboardAccountPort').CboardClosurePreview
  type CboardClosureReceiptPrepareValue = import('../src/platform/cboardAccountPort').CboardClosureReceiptPrepareValue
  type CboardClosureConfirmValue = import('../src/platform/cboardAccountPort').CboardClosureConfirmValue
  type CboardClosureStatusValue = import('../src/platform/cboardAccountPort').CboardClosureStatusValue

  export interface ClosureStorage {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
  }
  export interface ClosurePreview extends CboardClosurePreview { owner: string }
  export interface ClosureStatus extends CboardClosureStatusValue { confirmationUnknown?: boolean }
  export interface ClosureReceipt { owner: string; receiptId: string; secret: string; submitted?: boolean }
  export function createAccountClosure(options: {
    scope: string
    currentAccount(): string | null
    storage: ClosureStorage
    preserveLocal(input: { owner: string; familyIds: string[] }): Promise<{ saved: boolean }>
    api: {
      preview(): Promise<CboardClosurePreview>
      prepare(): Promise<CboardClosureReceiptPrepareValue>
      confirm(input: { familyIds: string[]; secret: string; confirmCloudDeletion: true }): Promise<CboardClosureConfirmValue>
      status(input: { receiptId: string; secret: string }): Promise<CboardClosureStatusValue>
    }
  }): {
    preview(): Promise<ClosurePreview>
    confirm(preview: ClosurePreview): Promise<ClosureStatus>
    status(): Promise<ClosureStatus | null>
    receipt(): Promise<ClosureReceipt | null>
  }
  export function accountClosureMessage(error: unknown): string
}

declare module '@cboard-communication-core/accountClosureRecovery' {
  import type { ClosureStorage } from '@cboard-communication-core/accountClosure'
  export function createAccountClosureRecovery(options: {
    storage: ClosureStorage
    scope: string
    currentAccount(): string | null
    buildArchive(): Promise<Uint8Array>
  }): {
    preserve(input: { owner: string }): Promise<{ saved: true }>
    load(owner: string): Promise<Uint8Array>
  }
}

declare module '@cboard-communication-core/careDeviceArchive' {
  export function exportCareDeviceArchive(identity: { familyId: string; profileId: string }, snapshot: any): Promise<Uint8Array>
}

