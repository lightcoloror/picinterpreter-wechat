import Taro from '@tarojs/taro'
import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { careScopedKey, currentCareContext } from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'

// Display only: the patient store and its upload queue must contain only that
// patient's own library. Bundled symbols remain available after adding personal cards.
export function loadCommunicationBoards() {
  if (currentCareContext() && Taro.getStorageSync(careScopedKey('care-locked'))) return []
  const patientBoards = taroPictureLibraryStore.load()
  if (!currentCareContext()) return patientBoards.length ? patientBoards : DEFAULT_BOARD_FIXTURES
  if (!patientBoards.length) return DEFAULT_BOARD_FIXTURES
  const patientIds = new Set(patientBoards.map(board => board.id))
  return DEFAULT_BOARD_FIXTURES.filter(board => !patientIds.has(board.id)).concat(patientBoards)
}
