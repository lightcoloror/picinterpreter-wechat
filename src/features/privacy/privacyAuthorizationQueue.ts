export type PrivacyAuthorizationDecision = 'agree' | 'disagree'

export type PrivacyAuthorizationResolver = (option: {
  event: 'exposureAuthorization' | PrivacyAuthorizationDecision
  buttonId?: string
}) => void

export function createPrivacyAuthorizationQueue(
  onPendingChange: (pending: boolean) => void
) {
  const pendingResolvers = new Set<PrivacyAuthorizationResolver>()

  return {
    enqueue(resolve: PrivacyAuthorizationResolver) {
      pendingResolvers.add(resolve)
      try {
        resolve({ event: 'exposureAuthorization' })
      } catch {
        // A failed exposure report must not discard the blocked privacy call.
      }
      onPendingChange(true)
    },

    settle(
      decision: PrivacyAuthorizationDecision,
      buttonId?: string
    ) {
      const resolvers = [...pendingResolvers]
      pendingResolvers.clear()
      onPendingChange(false)

      resolvers.forEach(resolve => {
        resolve(
          decision === 'agree'
            ? { event: 'agree', buttonId }
            : { event: 'disagree' }
        )
      })
    },

    pendingCount() {
      return pendingResolvers.size
    }
  }
}
