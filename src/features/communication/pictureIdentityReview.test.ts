import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import generatedBoards from '../../generated/cboardDefaultBoards.json'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'
import { applyMissingTokenResolutions, findSafeLocalMissingTokenResolutions } from '@cboard-communication-core/missingTokens'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test('all need cards package the existing want image rather than the old helping hands', () => {
  const tiles=DEFAULT_BOARD_FIXTURES.flatMap(board=>board.tiles)
  const sourceTiles=generatedBoards.flatMap(board=>board.tiles)
  const wantId=sourceTiles.find(tile=>tile.labelKey==='cboard.symbol.iWant')!.id
  const needIds=sourceTiles.filter(tile=>tile.labelKey==='cboard.symbol.iNeed').map(tile=>tile.id)
  const want=tiles.find(tile=>tile.id===wantId)!
  const need=tiles.filter(tile=>needIds.includes(tile.id))
  expect(need).toHaveLength(3)
  for(const tile of need) {
    expect(tile.image).toBe(want.image)
    expect(tile.image).not.toContain('5083f4d4500e0f76')
    const bytes=fs.readFileSync(path.resolve(process.cwd(),'src'+tile.image))
    expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
  }
})

test('keeps the old packaged image available for confirmed personal use', () => {
  const legacy='/assets/cboard-default/5083f4d4500e0f76.png'
  const bytes=fs.readFileSync(path.resolve(process.cwd(),'src'+legacy))
  expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
  const restored=restoreReceiverWorkspaceFromRecord({
    id:'synthetic-confirmed-legacy',direction:'receive',recordStatus:'confirmed',inputText:'要',
    output:[{id:'family-picked',label:'要',vocalization:'要',image:legacy}],
    pictogramSequence:[{pictogramId:'family-picked',originalToken:'要',label:'要',matchType:'manual',source:'manual'}]
  } as Parameters<typeof restoreReceiverWorkspaceFromRecord>[0],[])!
  expect(restored.session.reviewItems[0].tile!.tile.image).toBe(legacy)
})

test.each(['我自己回家','你自己回家','她自己回家','他本人回家'])('keeps %s intact through confirmation and offline record restore', text => {
  let state=runReceiverSession(text,DEFAULT_BOARD_FIXTURES)
  expect(state.reviewItems.map(item=>item.token).join('')).toBe(text)
  const item=state.reviewItems.find(item=>['自己','本人'].includes(item.token))!
  expect(item.tile).toBeNull()
  for(const missing of state.reviewItems.filter(item=>!item.tile)) state=retainReceiverItemAsText(state,missing.id)
  const record=JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(state)))
  const restored=restoreReceiverWorkspaceFromRecord(record,DEFAULT_BOARD_FIXTURES)!.session
  expect(restored.reviewItems.find(x=>x.token===item.token)!.tile!.textOnly).toBe(true)
  expect(restored.outputPreview.map(item=>item.vocalization).join('')).toBe(text)
})

test.each([
  ['自己','我','/symbols/arasaac/picinterpreter-care/6632.png'],
  ['要','要','/assets/cboard-default/5083f4d4500e0f76.png']
])('rechecks old %s → %s matches after storage restart without overriding confirmation', (token,label,image) => {
  const catalog=buildCommunicationTileCatalog([{id:'old',tiles:[{id:'legacy',label,vocalization:label,image,communicationSynonyms:token}]}])
  const values=new Map<string,unknown>()
  const storage={getStorageSync:(k:string)=>values.get(k)??'',setStorageSync:(k:string,v:unknown)=>{values.set(k,JSON.parse(JSON.stringify(v)))},removeStorageSync:(k:string)=>{values.delete(k)}}
  const repo=createWechatCommunicationRepository(storage)
  const [record]=repo.recordMissingTokens({tokens:[token],rawText:token})
  expect(findSafeLocalMissingTokenResolutions([record],catalog)).toEqual([])
  repo.reviewMissingToken(record.id,{status:'resolved',resolvedPictogramId:'legacy',reviewedByCaregiver:false})
  const restarted=createWechatCommunicationRepository(storage)
  const items=[{id:'current',token,tile:null,matchType:'none' as const}]
  expect(applyMissingTokenResolutions(items,restarted.loadMissingTokens(),catalog)[0].tile).toBeNull()
  restarted.reviewMissingToken(record.id,{status:'resolved',resolvedPictogramId:'legacy',reviewedByCaregiver:true})
  expect(applyMissingTokenResolutions(items,createWechatCommunicationRepository(storage).loadMissingTokens(),catalog)[0].tile!.id).toBe('legacy')
})
