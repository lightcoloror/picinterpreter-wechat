// Semantic tests use an explicit decoder fixture; native file/decode checks have separate tests.
import { describe, expect, it, vi } from 'vitest'
import { createArasaacPictogramSearchPort } from './arasaacPictogramSearchPort'
import { createPictogramSearchPort } from './pictogramSearchPort'
import { getPictogramConcept } from '@cboard-communication-core/pictogramSemantics'

describe('shared pictogram meanings on WeChat', () => {
  it('keeps park place, action, parking lot and kinship distinct', () => {
    expect(new Set(['公园','停车','停车场'].map(x=>getPictogramConcept(x)?.id)).size).toBe(3)
    expect(getPictogramConcept('哥哥')?.id).not.toBe(getPictogramConcept('弟弟')?.id)
    expect(getPictogramConcept('尿片')?.id).toBe(getPictogramConcept('尿布')?.id)
  })
  it('preserves original meaning through direct-provider search and local file caching', async () => {
    const request=vi.fn(async()=>({statusCode:200,data:[{_id:999999,keywords:[{keyword:'停车场',meaning:'车辆停放地点'}],categories:['transport']}]}))
    const port=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),request,
      downloadFile:async()=>({statusCode:200,tempFilePath:'tmp.png'}),
      saveFile:async()=>({savedFilePath:'wxfile://park.png'})})
    const rejected=await port.search(['公园'])
    expect(rejected.value!.some(x=>x.pictogram.source.originalId==='999999')).toBe(false)
    const result=await port.search(['停车场'])
    const wrong=result.value!.find(x=>x.pictogram.source.originalId==='999999')!.pictogram
    expect(wrong.label).toBe('停车场')
    expect(wrong.semantics?.relation).toBe('unverified')
    const cached=await port.cache(wrong)
    expect(cached.value?.semantics).toEqual(wrong.semantics)
    expect(JSON.parse(JSON.stringify(cached.value)).semantics.sourceDefinitions).toEqual(['车辆停放地点'])
  })
  it('API adapter keeps the same metadata and does not replace it during download', async()=>{
    const direct=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),
      request:async()=>({statusCode:200,data:[{_id:999999,keywords:[{keyword:'停车场'}]}]}),
      downloadFile:async()=>({statusCode:200,tempFilePath:'tmp'}),saveFile:async()=>({savedFilePath:'saved'})})
    const directResult=await direct.search(['停车场'])
    const raw=directResult.value![0].pictogram
    const api=createPictogramSearchPort({verifyImage:async()=>({status:'available'}),apiBaseUrl:'https://api.example.test',
      request:async()=>({statusCode:200,data:{results:[{token:'停车场',pictogram:{...raw,image:'/pictograms/arasaac/999999/image'}}]}}),
      downloadFile:async()=>({statusCode:200,tempFilePath:'tmp'}),saveFile:async()=>({savedFilePath:'wxfile://saved.png'})})
    const result=await api.search(['停车场'])
    const cached=await api.cache(result.value![0].pictogram)
    expect(cached.value?.semantics).toEqual(raw.semantics)
  })
  it('does not invent meaning provenance when caching a legacy candidate', async()=>{
    const port=createArasaacPictogramSearchPort({verifyImage:async()=>({status:'available'}),
      request:async()=>({statusCode:200,data:[]}),
      downloadFile:async()=>({statusCode:200,tempFilePath:'tmp'}),
      saveFile:async()=>({savedFilePath:'wxfile://saved.png'})})
    const result=await port.search(['尿片'])
    const legacy={...result.value![0].pictogram}
    delete legacy.semantics
    const cached=await port.cache(legacy)
    expect(cached.ok).toBe(true)
    expect(cached.value?.semantics).toBeUndefined()
  })
})
