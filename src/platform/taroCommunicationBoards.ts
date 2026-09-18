import Taro from '@tarojs/taro'
import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { careScopedKey, currentCareContext } from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'

// Display only: the patient store and its upload queue must contain only that
// patient's own library. A new empty library can still use bundled symbols.
export function loadCommunicationBoards() {
  if (currentCareContext() && Taro.getStorageSync(careScopedKey('care-locked'))) return []
  const patientBoards = taroPictureLibraryStore.load()
  return patientBoards.length ? patientBoards : DEFAULT_BOARD_FIXTURES
}
