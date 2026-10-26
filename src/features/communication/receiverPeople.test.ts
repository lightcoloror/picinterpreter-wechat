import { describe, expect, it } from 'vitest'
import { createBoardDTO } from '@cboard-communication-core/dto'
import { buildPersonalPictogramTileDTO } from '@cboard-communication-core/pictogramMetadataSuggestion'
import { buildReceiverHistoryEntry } from '@cboard-communication-core/receiverPipeline'
import { filterPublicPictureTokens } from '@cboard-communication-core/personalPeople'
import { runReceiverSession, replaceReceiverItem, restoreReceiverWorkspaceFromRecord, getReceiverReplacementCatalog } from './receiverSession'

describe('mini private full-name receiver', () => {
  const people = ['a', 'b'].map(id => buildPersonalPictogramTileDTO({ id, boardId: 'device_private_people', label: '欧阳明澈', category: 'people', image: `synthetic-private://${id}` }))
  const boards = [createBoardDTO({ id: 'device_private_people', name: '合成人物', tiles: people })]
  it('keeps a full name whole and requires same-name selection', () => {
    const state = runReceiverSession('欧阳明澈今天不回家', boards)
    expect(state.reviewItems[0].token).toBe('欧阳明澈')
    expect(state.reviewItems[0].tile).toBeNull()
    expect(state.reviewItems[0].personCandidates?.map(item => item.id)).toEqual(['a', 'b'])
    expect(filterPublicPictureTokens(['欧阳明澈', '回家'], getReceiverReplacementCatalog(boards))).toEqual(['回家'])
  })
  it('confirms a photo and restores the local draft without a service', () => {
    const state = runReceiverSession('欧阳明澈', boards)
    const chosen = replaceReceiverItem(state, state.reviewItems[0].id, state.reviewItems[0].personCandidates![1])
    const record = { ...buildReceiverHistoryEntry(chosen.inputText, chosen.reviewItems), id: 'synthetic-draft', recordStatus: 'draft' as const }
    const restored = restoreReceiverWorkspaceFromRecord(JSON.parse(JSON.stringify(record)), boards)!
    expect(restored.session.outputPreview[0].image).toBe('synthetic-private://b')
    expect(restored.session.outputPreview[0].label).toBe('欧阳明澈')
  })
  it('does not use private people from a different profile', () => {
    expect(runReceiverSession('欧阳明澈', []).outputPreview).toEqual([])
  })
})
