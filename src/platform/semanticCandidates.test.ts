// Semantic tests use an explicit decoder fixture; native file/decode checks have separate tests.
import { describe, expect, it, vi } from 'vitest'
import { createArasaacPictogramSearchPort } from './arasaacPictogramSearchPort'
import { createPictogramSearchPort } from './pictogramSearchPort'
import { createWechatCommunicationRepository } from './communicationRepository'
import { applyMissingTokenResolutions } from '@cboard-communication-core/missingTokens'
import { buildArasaacSemanticFields } from '@cboard-communication-core/pictogramSemantics'

const sourceRequest = async ({url}: {url:string}) => {
  const query=decodeURIComponent(url.split('/').pop() || '')
  if(query==='come back') return {statusCode:200,data:[
    {_id:999,keywords:[{keyword:'come back'}]},
    {_id:29714,keywords:[{keyword:'return'},{keyword:'come back'}]}]}
  if(query==='arrive') return {statusCode:200,data:[
    {_id:16807,keywords:[{keyword:'arrive'}]},
    {_id:16805,keywords:[{keyword:'arrive'}]}]}
  return {statusCode:404,data:[]}
}

it.each([['今晚','night','7181'],['吃饭','dine','38057']])(
  'reuses qualified candidates and confirmation/cache/restart for %s',async(token,query,id)=>{
    const request=vi.fn(async({url}:{url:string})=>({statusCode:200,data:url.endsWith('/'+query)
      ? [{_id:Number(id),keywords:[{keyword:query}]},{_id:4593,keywords:[{keyword:'dine'}]}]:[]}))
    const downloadFile=vi.fn(async()=>({statusCode:200,tempFilePath:'wxfile://temp/picture.png'}))
    const port=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),request,downloadFile,saveFile:async()=>({savedFilePath:`wxfile://saved/${id}.png`})})
    const data:Record<string,unknown>={}
    const storage={getStorageSync:(key:string)=>data[key],setStorageSync:(key:string,value:unknown)=>{data[key]=JSON.parse(JSON.stringify(value))},removeStorageSync:(key:string)=>{delete data[key]}}
    const repo=createWechatCommunicationRepository(storage)
    const record=repo.recordMissingTokens({tokens:[token],rawText:token})[0]
    const result=await port.search([token])
    expect(result.ok).toBe(true)
    expect(result.value!.map(r=>r.pictogram.source.originalId)).toEqual([id])
    const picture=result.value![0].pictogram
    repo.reviewMissingToken(record.id,{status:'suggested',suggestedPictogram:picture,source:'online'})
    const items=[{id:'token',token,tile:null,matchType:'missing' as const}]
    expect(applyMissingTokenResolutions(items,repo.loadMissingTokens(),[])[0].tile).toBeNull()
    expect(downloadFile).not.toHaveBeenCalled()
    const cached=await port.cache(picture)
    expect(cached.ok).toBe(true)
    repo.reviewMissingToken(record.id,{status:'resolved',resolvedPictogramId:picture.id,resolvedPictogram:cached.value!,reviewedByCaregiver:true})
    request.mockRejectedValue(new Error('offline'))
    downloadFile.mockRejectedValue(new Error('offline'))
    const restored=createWechatCommunicationRepository(storage).loadMissingTokens()
    const output=applyMissingTokenResolutions(items,restored,[])[0].tile!.tile
    expect(output.vocalization).toBe(token)
    expect(output.image).toBe(`wxfile://saved/${id}.png`)
    expect(restored[0].resolvedPictogram!.semantics).toEqual(picture.semantics)
    expect(downloadFile).toHaveBeenCalledTimes(1)
  })

describe.each(['direct','api'])('home semantic candidates through %s adapter', adapter => {
  it('ranks before limiting and rejects unsolicited expression results',async()=>{
    const items = [1,2,3,4].map(_id=>({_id,keywords:[{keyword:'go home'}]}))
    items.push({_id:29714,keywords:[{keyword:'come back'}]})
    const files={downloadFile:async()=>({statusCode:200,tempFilePath:'tmp'}),saveFile:async()=>({savedFilePath:'wxfile://saved'})}
    const direct=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),...files,request:async()=>({statusCode:200,data:items})})
    const raw=items.map(item=>({token:'回家',pictogram:{id:`runtime_${item._id}`,
      ...buildArasaacSemanticFields('回家','回家','zh',item._id,item),image:`/pictograms/arasaac/${item._id}/image`,
      source:{provider:'arasaac',originalId:String(item._id),name:'ARASAAC',license:'CC BY-NC-SA 4.0',sourceUrl:`https://arasaac.org/pictograms/${item._id}`}}}))
    const port=adapter==='direct'?direct:createPictogramSearchPort({verifyImage:async()=>({status:'available'}),...files,apiBaseUrl:'https://api.example.test',
      request:async()=>({statusCode:200,data:{results:[...raw,{...raw[0],token:'其他家庭词'}]}})})
    const result=await port.search(['回家'])
    expect(result.value!.map(row=>row.pictogram.source.originalId)).toEqual(['29714','1','2','3'])
    expect(result.value!.every(row=>row.token==='回家' && row.pictogram.semantics?.requiresReview)).toBe(true)
  })
  it('reuses confirmation, persistent files and repository restart without online access', async()=>{
    const downloadFile=vi.fn(async()=>({statusCode:200,tempFilePath:'tmp.png'}))
    const saveFile=vi.fn(async()=>({savedFilePath:'wxfile://saved/home.png'}))
    const direct=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),request:sourceRequest,downloadFile,saveFile})
    const source=await direct.search(['回家'])
    const request=vi.fn(async()=>({statusCode:200,data:{results:source.value!.map(row=>({token:row.token,pictogram:{
      ...row.pictogram,image:`/pictograms/arasaac/${row.pictogram.source.originalId}/image`
    }}))}}))
    const port=adapter==='direct'?direct:createPictogramSearchPort({verifyImage:async()=>({status:'available'}),apiBaseUrl:'https://api.example.test',request,downloadFile,saveFile})
    const result=await port.search(['回家'])
    expect(result.ok).toBe(true)
    expect(result.value!.map(r=>r.pictogram.source.originalId)).toEqual(['29714','16805'])
    expect(result.value!.map(r=>r.pictogram.semantics?.candidateMatch)).toEqual(['strong','approximate'])
    expect(result.value![0].pictogram.label).toBe('return')
    expect(result.value![1].pictogram.semantics?.lookupText).toBe('arrive')
    const values=new Map<string,unknown>()
    const storage={getStorageSync:(key:string)=>values.get(key)??'',setStorageSync:(key:string,value:unknown)=>{values.set(key,value)},removeStorageSync:(key:string)=>{values.delete(key)}}
    const repo=createWechatCommunicationRepository(storage)
    const [record]=repo.recordMissingTokens({tokens:['回家'],rawText:'我不回家'})
    const picture=result.value![0].pictogram
    repo.reviewMissingToken(record.id,{status:'suggested',suggestedPictogram:picture,source:'online'})
    const items=[{id:'home-token',token:'回家',tile:null,matchType:'missing' as const}]
    expect(applyMissingTokenResolutions(items,repo.loadMissingTokens(),[])[0].tile).toBeNull()
    expect(downloadFile).not.toHaveBeenCalled()
    const cached=await port.cache(picture)
    expect(cached.ok).toBe(true)
    repo.reviewMissingToken(record.id,{status:'resolved',resolvedPictogramId:picture.id,resolvedPictogram:cached.value!,reviewedByCaregiver:true})
    downloadFile.mockRejectedValue(new Error('offline'))
    request.mockRejectedValue(new Error('offline'))
    const restored=createWechatCommunicationRepository(storage).loadMissingTokens()
    const applied=applyMissingTokenResolutions(items,restored,[])
    expect(applied[0].tile!.tile.image).toBe('wxfile://saved/home.png')
    expect(applied[0].tile!.tile.vocalization).toBe('回家')
    expect(restored[0].resolvedPictogram!.semantics).toEqual(picture.semantics)
    expect(downloadFile).toHaveBeenCalledTimes(1)
  })
})

it('retains a usable strong candidate if the approximate lookup fails',async()=>{
  const port=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),request:async options=>{
    if(options.url.endsWith('/arrive')) throw new Error('offline')
    return sourceRequest(options)
  },downloadFile:async()=>({statusCode:500,tempFilePath:''}),saveFile:async()=>({savedFilePath:''})})
  const result=await port.search(['回家'])
  expect(result.ok).toBe(true)
  expect(result.value!.map(r=>r.pictogram.source.originalId)).toEqual(['29714'])
  expect((await port.cache(result.value![0].pictogram)).ok).toBe(false)
})
