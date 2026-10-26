import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'
import { applyMissingTokenResolutions, findSafeLocalMissingTokenResolutions } from '@cboard-communication-core/missingTokens'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { runReceiverSession, retainReceiverItemAsText, buildConfirmedReceiverHistory, restoreReceiverWorkspaceFromRecord } from './receiverSession'

test.each(['她想开门','他不想开门','她自己打开门','请打开罐头','不要打开罐头'])('packages, confirms and restores %s without network', text => {
  let state=runReceiverSession(text,DEFAULT_BOARD_FIXTURES)
  expect(state.reviewItems.map(item=>item.token).join('')).toBe(text)
  for(const missing of state.reviewItems.filter(item=>!item.tile)) state=retainReceiverItemAsText(state,missing.id)
  const action=state.reviewItems.find(item=>/^(打开|开)(门|罐头)$/.test(item.token))!
  expect(action.tile!.id).toBe(action.token.endsWith('门')?'tuyujia-builtin-open-door':'tuyujia-builtin-open-tin')
  const person=state.reviewItems.find(item=>['他','她'].includes(item.token))
  if(person) {
    expect(person.tile!.id).toBe(person.token==='她'?'tuyujia-builtin-she':'pi-core-they')
    expect(person.tile!.tile.pictogramAttribution).toMatchObject({provider:'arasaac',originalId:person.token==='她'?'she.png':'6480'})
  }
  for(const item of state.reviewItems.filter(item=>item.tile && !item.tile.textOnly)) {
    const bytes=fs.readFileSync(path.resolve(process.cwd(),'src'+item.tile!.tile.image))
    expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
  }
  const record=JSON.parse(JSON.stringify(buildConfirmedReceiverHistory(state)))
  const restored=restoreReceiverWorkspaceFromRecord(record,DEFAULT_BOARD_FIXTURES)!.session
  expect(restored.outputPreview.map(item=>item.vocalization).join('')).toBe(text)
  expect(restored.reviewItems.find(item=>item.token===action.token)!.tile!.tile.image).toBe(action.tile!.tile.image)
})

test.each([
  ['她','/assets/cboard-default/27542f3f4b2084cc.png'],
  ['打开','/assets/cboard-default/157a1fa5acb46be1.png'],
  ['打开','/assets/cboard-default/8a84c933d83a7e2b.png']
])('legacy automatic %s pictures stay rejected after storage restart; explicit confirmation survives', (token,image) => {
  const catalog=buildCommunicationTileCatalog([{id:'old',tiles:[{id:'legacy',label:token,vocalization:token,image}]}])
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

test('generic 打开 remains text-ready and the original jar picture remains usable for its reviewed meaning', () => {
  expect(runReceiverSession('请打开窗户',DEFAULT_BOARD_FIXTURES).reviewItems.find(item=>item.token==='打开')!.tile).toBeNull()
  const jar=runReceiverSession('拧开盖子',DEFAULT_BOARD_FIXTURES).reviewItems[0]
  expect(jar.tile!.tile.image).toContain('157a1fa5acb46be1.png')
})
