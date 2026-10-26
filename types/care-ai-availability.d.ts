declare module '@cboard-communication-core/careAiAvailability' {
  export interface CareTextAiAvailability {
    available: boolean; message: string; action?: string; code?: string
  }
  export function evaluateCareTextAiAvailability(input?: {
    enabled?: boolean; isLogged?: boolean; accountId?: string; careMode?: boolean;
    profile?: { id?: string; locked?: boolean } | null;
    fundingId?: string; storageFailed?: boolean; quotaInsufficient?: boolean;
  }): CareTextAiAvailability
}
