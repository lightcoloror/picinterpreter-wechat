declare module '@cboard-communication-core/candidateAutoplay' {
  export interface CandidateAutoplayCancelResult {
    hadPending: boolean
    hadActive: boolean
  }

  export interface CandidateAutoplayController {
    schedule(
      candidateSentences: string[],
      delaySeconds: number
    ): boolean
    cancel(options?: {
      stopActivePlayback?: boolean
    }): CandidateAutoplayCancelResult
    dispose(): void
  }

  export function createCandidateAutoplayController(input: {
    setTimer(
      callback: () => void | Promise<void>,
      delay: number
    ): ReturnType<typeof setTimeout>
    clearTimer(timer: ReturnType<typeof setTimeout>): void
    playCandidates(candidateSentences: string[]): Promise<void>
    stopPlayback(): void
  }): CandidateAutoplayController
}
