import Taro from '@tarojs/taro'
import { createBoardDTO } from '@cboard-communication-core/dto'
import { DEFAULT_BOARD_FIXTURES } from '../fixtures/defaultBoard'
import { careScopedKey, currentCareContext } from './taroCareContext'
import { taroPictureLibraryStore } from './taroPictureLibraryStore'

// Display only: the patient store and its upload queue must contain only that
// patient's own library. Bundled symbols remain available after adding personal cards.
export function loadCommunicationBoards() {
  const context = currentCareContext()
  if (context && Taro.getStorageSync(careScopedKey('care-locked'))) return []
  const patientBoards = taroPictureLibraryStore.load()
  if (!context) return patientBoards.length ? patientBoards : DEFAULT_BOARD_FIXTURES
  if (!patientBoards.length) return DEFAULT_BOARD_FIXTURES
  const patientIds = new Set(patientBoards.map(board => board.id))
  const boards = DEFAULT_BOARD_FIXTURES
    .filter(board => !patientIds.has(board.id))
    .concat(patientBoards)
  const root = boards.find(board => board.id === 'root')
  if (!root) return boards

  const linkedBoardIds = new Set(root.tiles.map(tile => tile.loadBoardId).filter(Boolean))
  const tileIds = new Set(root.tiles.map(tile => tile.id))
  const links = patientBoards
    .filter(board => board.id !== root.id && !linkedBoardIds.has(board.id))
    .map(board => {
      const baseId = `care-board-link:${encodeURIComponent(board.id)}`
      let id = baseId
      let suffix = 1
      while (tileIds.has(id)) {
        id = `${baseId}:${suffix++}`
      }
      tileIds.add(id)
      return createBoardDTO({
        id: root.id,
        name: root.name,
        tiles: [{
          id,
          label: board.name || '图板',
          vocalization: board.name || '图板',
          loadBoardId: board.id
        }]
      }).tiles[0]
    })
  if (!links.length) return boards

  const displayRoot = {
    ...root,
    tiles: [...root.tiles, ...links],
    layout: {
      ...root.layout,
      tileIds: [
        ...(root.layout?.tileIds || root.tiles.map(tile => tile.id)),
        ...links.map(tile => tile.id)
      ]
    }
  }
  return boards.map(board =>
    board.id === root.id ? displayRoot : board
  )
}
