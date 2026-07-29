declare module '@cboard-communication-core/communicationOnboarding' {
  export interface CommunicationOnboardingStep {
    readonly id: 'express' | 'receive' | 'offline'
    readonly title: string
    readonly description: string
  }

  export const COMMUNICATION_ONBOARDING_CONTENT: {
    readonly eyebrow: string
    readonly title: string
    readonly steps: readonly CommunicationOnboardingStep[]
  }
}
