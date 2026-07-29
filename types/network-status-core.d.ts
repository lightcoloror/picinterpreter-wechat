declare module '@cboard-communication-core/networkStatus' {
  export const COMMUNICATION_NETWORK_AVAILABILITY: Readonly<{
    online: 'online'
    offline: 'offline'
    unknown: 'unknown'
  }>

  export type CommunicationNetworkAvailability =
    (typeof COMMUNICATION_NETWORK_AVAILABILITY)[keyof typeof COMMUNICATION_NETWORK_AVAILABILITY]

  export interface CommunicationNetworkStatusInput {
    isConnected?: boolean
    networkType?: string
  }

  export interface CommunicationNetworkStatus {
    availability: CommunicationNetworkAvailability
    networkType: string
  }

  export interface CommunicationNetworkStatusCopy {
    title: string
    detail: string
  }

  export function normalizeCommunicationNetworkStatus(
    value?: CommunicationNetworkStatusInput
  ): CommunicationNetworkStatus

  export function getCommunicationNetworkStatusCopy(
    status?: Partial<CommunicationNetworkStatus>
  ): CommunicationNetworkStatusCopy | null
}
