declare module '@cboard-communication-core/careSharedPhrases' {
  export function projectCareSharedPhrases(snapshot: any, role: string | undefined, image: (asset: any) => string): Array<import('@cboard-communication-core/repository').CommunicationSavedPhraseEntry & { careSharedReadOnly: true }>
  export function isCareSharedPhrase(item: unknown): boolean
}
