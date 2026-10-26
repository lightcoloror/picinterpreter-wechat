import Taro from '@tarojs/taro'
import { currentImageOperationEpoch } from '@cboard-communication-core/imageOperationEpoch'
import { createGalleryTileUndoAdapter } from './galleryTileUndoAdapter'
import { createTaroCommunicationRepository } from './taroCommunicationRepository'
import { canEditCareLibrary, careScopedKey, currentCareContext } from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'

const repository = createTaroCommunicationRepository()

function libraryIsEditable() {
  const context = currentCareContext()
  return canEditCareLibrary(context) && !context?.selection?.locked &&
    !Taro.getStorageSync(careScopedKey('care-locked'))
}

export function currentGalleryUndoScope() {
  const identity = repository.loadCommunicationIdentity()
  return JSON.stringify([
    currentImageOperationEpoch(), careScopedKey(''),
    identity.workspaceId, identity.patientId, libraryIsEditable()
  ])
}

export const taroGalleryTileUndo = createGalleryTileUndoAdapter({
  store: taroPictureLibraryStore,
  getScopeKey: currentGalleryUndoScope,
  canManage: () => libraryIsEditable()
})
