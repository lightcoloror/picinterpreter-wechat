declare module '@cboard-communication-core/accountPhoneVerification' {
  export interface PhoneVerificationMatchInput {
    phone: string
    verifiedPhone: string
    verificationToken: string
  }

  export function hasMatchingPhoneVerification(
    input: PhoneVerificationMatchInput
  ): boolean
}
