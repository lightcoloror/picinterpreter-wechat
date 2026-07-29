import {
  normalizeCommunicationNetworkStatus
} from '@cboard-communication-core/networkStatus'

export type NetworkAvailability = 'online' | 'offline' | 'unknown'

export interface CommunicationNetworkStatus {
  availability: NetworkAvailability
  networkType: string
}

export interface NetworkStatusChange {
  isConnected: boolean
  networkType: string
}

export interface NetworkStatusAdapter {
  getNetworkType(): Promise<{ networkType: string }>
  onNetworkStatusChange(
    listener: (change: NetworkStatusChange) => void
  ): void
  offNetworkStatusChange(
    listener: (change: NetworkStatusChange) => void
  ): void
}

export interface NetworkStatusPort {
  getCurrent(): Promise<CommunicationNetworkStatus>
  subscribe(
    listener: (status: CommunicationNetworkStatus) => void
  ): () => void
}

export function createNetworkStatusPort(
  adapter: NetworkStatusAdapter
): NetworkStatusPort {
  return {
    async getCurrent() {
      try {
        const result = await adapter.getNetworkType()
        return normalizeCommunicationNetworkStatus({
          networkType: result.networkType
        }) as CommunicationNetworkStatus
      } catch (error) {
        return {
          availability: 'unknown',
          networkType: 'unknown'
        }
      }
    },

    subscribe(listener) {
      const handleChange = (change: NetworkStatusChange) => {
        listener(normalizeCommunicationNetworkStatus({
          isConnected: change.isConnected,
          networkType: change.networkType
        }) as CommunicationNetworkStatus)
      }

      adapter.onNetworkStatusChange(handleChange)
      return () => adapter.offNetworkStatusChange(handleChange)
    }
  }
}
