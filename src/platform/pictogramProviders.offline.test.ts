import {describe,it,expect,vi} from 'vitest'
import {createPictogramSearchPort} from './pictogramSearchPort'
import {createWechatCommunicationRepository} from './communicationRepository'
import {applyMissingTokenResolutions} from '@cboard-communication-core/missingTokens'
import {readFileSync} from 'node:fs'

const liveFixture=process.env.TUYUJIA_LIVE_PICTOGRAM_FIXTURE
  ?JSON.parse(readFileSync(process.env.TUYUJIA_LIVE_PICTOGRAM_FIXTURE,'utf8')):null
describe.each(['arasaac','globalsymbols','opensymbols',...(liveFixture?['provider-live']:[])])('%s API confirmation and offline reuse',caseName=>{
  const captured=caseName==='provider-live'?liveFixture:null
  const provider=captured?captured.candidate.source.provider:caseName
  const token=captured?captured.token:'苹果'
  const path=captured?captured.candidate.imageUrl:`/pictograms/${provider}/${provider==='arasaac'?'123':'c3ludGhldGlj.0123456789abcdef0123456789abcdef'}/image`
  const candidate=captured?captured.candidate:{id:`${provider}-123`,label:'苹果',imageUrl:path,
    source:{provider,originalId:'123',name:provider,license:'CC BY-SA 4.0',
      sourceUrl:`https://example.test/${provider}/123`}}
  const setup=()=>{
    const request=vi.fn(async()=>({statusCode:200,data:{results:[{token,pictogram:candidate}]}}))
    const downloadFile=vi.fn(async()=>({statusCode:200,tempFilePath:'temp.png'}))
    const saveFile=vi.fn(async()=>({savedFilePath:`wxfile://saved/${provider}.png`}))
    const port=createPictogramSearchPort({verifyImage: async () => ({status: 'available'}),apiBaseUrl:'https://api.example.test/api',request,downloadFile,saveFile})
    const values=new Map<string,unknown>()
    const storage={getStorageSync:(key:string)=>values.get(key)??'',setStorageSync:(key:string,value:unknown)=>{values.set(key,value)},removeStorageSync:(key:string)=>{values.delete(key)}}
    const repo=createWechatCommunicationRepository(storage)
    return {request,downloadFile,saveFile,port,storage,repo}
  }
  it('keeps attribution and restores a saved file without network calls',async()=>{
    const h=setup()
    const result=await h.port.search([token])
    const pic=result.value![0].pictogram
    const [record]=h.repo.recordMissingTokens({tokens:[token],rawText:token})
    h.repo.reviewMissingToken(record.id,{status:'suggested',suggestedPictogram:pic,source:'online'})
    const items=[{id:'apple',token,tile:null,matchType:'missing' as const}]
    expect(applyMissingTokenResolutions(items,h.repo.loadMissingTokens(),[])[0].tile).toBeNull()
    expect(h.downloadFile).not.toHaveBeenCalled()
    const cached=await h.port.cache(pic)
    expect(cached.ok).toBe(true)
    expect(h.downloadFile).toHaveBeenCalledWith({url:'https://api.example.test/api'+path})
    h.repo.reviewMissingToken(record.id,{status:'resolved',resolvedPictogramId:pic.id,resolvedPictogram:cached.value!,reviewedByCaregiver:true})
    h.request.mockRejectedValue(new Error('offline'));h.downloadFile.mockRejectedValue(new Error('offline'))
    const restored=createWechatCommunicationRepository(h.storage).loadMissingTokens()
    expect(restored[0].resolvedPictogram!.source).toMatchObject(candidate.source)
    expect(applyMissingTokenResolutions(items,restored,[])[0].tile!.tile.image).toBe(`wxfile://saved/${provider}.png`)
    expect(h.request).toHaveBeenCalledTimes(1);expect(h.downloadFile).toHaveBeenCalledTimes(1)
  })
  it('keeps the suggestion when download or persistent-file save fails, then permits retry',async()=>{
    const h=setup();const pic=(await h.port.search([token])).value![0].pictogram
    const [record]=h.repo.recordMissingTokens({tokens:[token],rawText:token})
    h.repo.reviewMissingToken(record.id,{status:'suggested',suggestedPictogram:pic,source:'online'})
    h.downloadFile.mockRejectedValueOnce(new Error('offline'))
    expect((await h.port.cache(pic)).ok).toBe(false)
    expect(h.saveFile).not.toHaveBeenCalled()
    h.saveFile.mockRejectedValueOnce(new Error('quota'))
    expect((await h.port.cache(pic)).ok).toBe(false)
    expect(h.repo.loadMissingTokens()[0].status).toBe('suggested')
    expect((await h.port.cache(pic)).ok).toBe(true)
  })
})
