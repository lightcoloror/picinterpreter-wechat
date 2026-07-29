import type { BoardDTO, TileDTO } from '@cboard-communication-core/dto'
import {
  buildCommunicationHistoryAnonymizedOpenBoardLog,
  buildCommunicationHistoryExportText,
  buildCommunicationHistoryOpenBoardLog,
  clearCommunicationHistory,
  deleteCommunicationHistoryEntry,
  getCommunicationHistoryReplayText,
  importCommunicationHistoryOpenBoardLog,
  normalizeManagedCommunicationHistory,
  toggleCommunicationHistoryFavorite,
  updateCommunicationHistoryCandidateFeedback
} from '@cboard-communication-core/historyManagement'
import type {
  CommunicationHistoryEntry,
  CommunicationRepository,
  CommunicationSavedPhraseEntry
} from '@cboard-communication-core/repository'
import {
  addCommunicationSavedPhrase,
  buildCommunicationSavedPhraseExport,
  getCommunicationQuickPhrases,
  importCommunicationSavedPhrases,
  markCommunicationSavedPhraseUsed,
  renameCommunicationSavedPhrase
} from '@cboard-communication-core/savedPhraseManagement'

export interface CommunicationManagementService {
  loadSavedPhrases(): CommunicationSavedPhraseEntry[]
  addSavedPhrase(sentence: string, output?: TileDTO[]): CommunicationSavedPhraseEntry[]
  renameSavedPhrase(id: string, sentence: string): CommunicationSavedPhraseEntry[]
  deleteSavedPhrase(id: string): CommunicationSavedPhraseEntry[]
  markSavedPhraseUsed(id: string): CommunicationSavedPhraseEntry[]
  getQuickPhrases(limit?: number): CommunicationSavedPhraseEntry[]
  exportSavedPhrases(): string
  importSavedPhrases(json: string): ReturnType<typeof importCommunicationSavedPhrases>
  loadHistory(): CommunicationHistoryEntry[]
  toggleHistoryFavorite(id: string): CommunicationHistoryEntry[]
  updateHistoryCandidateFeedback(
    id: string,
    candidateIndex: number,
    feedback: 'up' | 'down'
  ): CommunicationHistoryEntry[]
  deleteHistory(id: string): CommunicationHistoryEntry[]
  clearHistory(): CommunicationHistoryEntry[]
  getHistoryReplayText(entry: CommunicationHistoryEntry): string
  exportHistory(): string
  exportHistoryOpenBoardLog(): string
  exportHistoryAnonymizedOpenBoardLog(): string
  importHistoryOpenBoardLog(
    input: string
  ): ReturnType<typeof importCommunicationHistoryOpenBoardLog>
}

function buildTileIndex(boards: BoardDTO[]) {
  const tiles = (Array.isArray(boards) ? boards : []).flatMap(board => board.tiles)
  return new Map(tiles.map(tile => [tile.id, tile]))
}

export function createCommunicationManagementService({
  repository,
  boards,
  now = Date.now
}: {
  repository: CommunicationRepository
  boards: BoardDTO[]
  now?: () => number
}): CommunicationManagementService {
  const tileIndex = buildTileIndex(boards)

  const persistSavedPhrases = (items: CommunicationSavedPhraseEntry[]) => {
    repository.overwriteCommunicationSavedPhrases(items)
    return repository.loadCommunicationSavedPhrases()
  }

  const persistHistory = (items: CommunicationHistoryEntry[]) => {
    repository.overwriteCommunicationHistory(items)
    return normalizeManagedCommunicationHistory(
      repository.loadCommunicationHistory()
    )
  }

  return {
    loadSavedPhrases: () => repository.loadCommunicationSavedPhrases(),

    addSavedPhrase(sentence, output = []) {
      const result = addCommunicationSavedPhrase(
        repository.loadCommunicationSavedPhrases(),
        { sentence, output },
        { now }
      )
      return result.changed ? persistSavedPhrases(result.items) : result.items
    },

    renameSavedPhrase(id, sentence) {
      const result = renameCommunicationSavedPhrase(
        repository.loadCommunicationSavedPhrases(),
        id,
        sentence,
        { now }
      )
      return result.changed ? persistSavedPhrases(result.items) : result.items
    },

    deleteSavedPhrase(id) {
      repository.deleteCommunicationSavedPhrase(id)
      return repository.loadCommunicationSavedPhrases()
    },

    markSavedPhraseUsed(id) {
      const result = markCommunicationSavedPhraseUsed(
        repository.loadCommunicationSavedPhrases(),
        id,
        { now }
      )
      return result.changed ? persistSavedPhrases(result.items) : result.items
    },

    getQuickPhrases(limit) {
      return getCommunicationQuickPhrases(
        repository.loadCommunicationSavedPhrases(),
        limit
      )
    },

    exportSavedPhrases() {
      return JSON.stringify(
        buildCommunicationSavedPhraseExport(
          repository.loadCommunicationSavedPhrases(),
          { now, appId: 'picinterpreter' }
        ),
        null,
        2
      )
    },

    importSavedPhrases(json) {
      const result = importCommunicationSavedPhrases(
        json,
        repository.loadCommunicationSavedPhrases(),
        {
          availableTileIds: new Set(tileIndex.keys()),
          resolveTile: id => tileIndex.get(id) || null,
          now
        }
      )
      if (result.ok && result.addedCount) persistSavedPhrases(result.items)
      return result
    },

    loadHistory: () =>
      normalizeManagedCommunicationHistory(repository.loadCommunicationHistory()),

    toggleHistoryFavorite(id) {
      const result = toggleCommunicationHistoryFavorite(
        repository.loadCommunicationHistory(),
        id,
        { now }
      )
      return result.changed ? persistHistory(result.items) : result.items
    },

    updateHistoryCandidateFeedback(id, candidateIndex, feedback) {
      const result = updateCommunicationHistoryCandidateFeedback(
        repository.loadCommunicationHistory(),
        id,
        candidateIndex,
        feedback,
        { now }
      )
      return result.changed ? persistHistory(result.items) : result.items
    },

    deleteHistory(id) {
      const result = deleteCommunicationHistoryEntry(
        repository.loadCommunicationHistory(),
        id
      )
      return result.changed ? persistHistory(result.items) : result.items
    },

    clearHistory() {
      return persistHistory(clearCommunicationHistory())
    },

    getHistoryReplayText: entry => getCommunicationHistoryReplayText(entry),

    exportHistory: () =>
      buildCommunicationHistoryExportText(repository.loadCommunicationHistory(), {
        now
      }),

    exportHistoryOpenBoardLog: () =>
      buildCommunicationHistoryOpenBoardLog(
        repository.loadCommunicationHistory(),
        { now, source: 'picinterpreter-wechat' }
      ),

    exportHistoryAnonymizedOpenBoardLog: () =>
      buildCommunicationHistoryAnonymizedOpenBoardLog(
        repository.loadCommunicationHistory(),
        { now, source: 'picinterpreter-wechat' }
      ),

    importHistoryOpenBoardLog(input) {
      const result = importCommunicationHistoryOpenBoardLog(
        input,
        repository.loadCommunicationHistory()
      )
      if (!result.ok || !result.addedCount) return result
      return {
        ...result,
        items: persistHistory(result.items)
      }
    }
  }
}
