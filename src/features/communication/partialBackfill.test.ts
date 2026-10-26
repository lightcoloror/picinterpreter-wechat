import { describe, expect, it } from 'vitest'
import { runReceiverSession, refreshReceiverMissingItems, replaceReceiverReviewItems, retainReceiverItemAsText } from './receiverSession'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'
import { buildCommunicationTileCatalog } from '@cboard-communication-core/symbolMatching'

const boardFor = (label: string) => [{id:'b',name:'合成测试',tiles:[{id:'generic',label,image:'/generic.png'}]}]

describe('shared partial matching and backfill on WeChat', () => {
  it.each(['停车场','洗衣机','洗衣液','洗碗液','沐浴露','肥皂块','鸡肉卷','豆腐脑','电动车','电话卡','热水袋','饮用水'])
  ('keeps the natural whole-object query and negation for %s', token => {
    const state=runReceiverSession(`我不要${token}`,[])
    expect(state.reviewItems.map(item=>item.token)).toEqual(['我','不要',token])
    expect(state.reviewItems[2].tile).toBeNull()
    expect(state.reviewItems.filter(item=>!item.tile).map(item=>item.token)).toContain(token)
  })
  it.each([
    ['葡萄柚','葡萄'],['洗手液','洗手'],['手机壳','手机'],
    ['花生油','花生'],['自行车道','自行车'],['游泳池','游泳'],
    ['开心果','开心'],['开心果','水果'],['洗手液','肥皂块']
  ])('%s remains missing instead of consuming %s', (token,label) => {
    const state=runReceiverSession(token,boardFor(label),{preSegmented:[token]})
    expect(state.quality.missingCount).toBe(1)
    expect(state.outputPreview).toEqual([])
    expect(state.reviewItems[0].token).toBe(token)
  })

  it('refreshes a confirmed saved-file mapping over a legacy partial and preserves manual text', () => {
    const values=new Map<string,unknown>()
    const storage={getStorageSync:(key:string)=>values.get(key)??'',setStorageSync:(key:string,value:unknown)=>{values.set(key,value)},removeStorageSync:(key:string)=>{values.delete(key)}}
    const repo=createWechatCommunicationRepository(storage)
    const boards=boardFor('葡萄')
    let state=runReceiverSession('葡萄柚',boards,{preSegmented:['葡萄柚']})
    const [gap]=repo.recordMissingTokens({tokens:['葡萄柚'],rawText:'葡萄柚'})
    const pic={id:'grapefruit',label:'葡萄柚',image:'wxfile://saved/grapefruit.png',
      source:{provider:'opensymbols',originalId:'grapefruit',name:'OpenSymbols',license:'CC BY-SA',sourceUrl:'https://example.test/grapefruit'}}
    repo.reviewMissingToken(gap.id,{status:'suggested',suggestedPictogram:pic,source:'online'})
    state=replaceReceiverReviewItems(state,[{...state.reviewItems[0],matchType:'partial',tile:buildCommunicationTileCatalog(boards)[0]}])
    expect(refreshReceiverMissingItems(state,boards,repo.loadMissingTokens())).toBe(state)
    repo.reviewMissingToken(gap.id,{status:'resolved',resolvedPictogram:pic,resolvedPictogramId:pic.id,reviewedByCaregiver:true,source:'online'})
    const saved=createWechatCommunicationRepository(storage).loadMissingTokens()
    const refreshed=refreshReceiverMissingItems(state,boards,saved)
    expect(refreshed.reviewItems[0].tile!.id).toBe(pic.id)
    expect(refreshed.outputPreview[0].image).toBe(pic.image)
    expect(refreshed.outputPreview[0].vocalization).toBe('葡萄柚')
    const text=retainReceiverItemAsText(state,state.reviewItems[0].id)
    expect(refreshReceiverMissingItems(text,boards,saved)).toBe(text)
  })
})
