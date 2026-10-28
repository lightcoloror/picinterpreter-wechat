declare module '@cboard-communication-core/pictogramSemantics' {
  import type { CommunicationCatalogItem } from '@cboard-communication-core/symbolMatching'
  export function getLocalPictogramCandidates(token: string, catalog?: CommunicationCatalogItem[], fallbackCatalog?: CommunicationCatalogItem[]): Array<{
    item: CommunicationCatalogItem; relation: string; hint: string; sourceId: string
  }>
}
