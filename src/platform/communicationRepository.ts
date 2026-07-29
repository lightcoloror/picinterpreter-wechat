import {
  createWechatKeyValueStore,
  type WechatStorageApi
} from '@cboard-communication-core/adapters/wechatStorage'
import {
  createCommunicationRepository,
  type CommunicationRepository
} from '@cboard-communication-core/repository'

export function createWechatCommunicationRepository(
  wechatApi: WechatStorageApi
): CommunicationRepository {
  return createCommunicationRepository({
    storage: createWechatKeyValueStore(wechatApi)
  })
}
