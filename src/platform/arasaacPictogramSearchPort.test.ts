import { describe, expect, test, vi } from 'vitest'

import { createArasaacPictogramSearchPort } from './arasaacPictogramSearchPort'

function createHarness() {
  const request = vi.fn(async (options: {url: string}) => ({
    statusCode: 200,
    data: [{ _id: 37331, keywords: [{keyword: decodeURIComponent(options.url.split('/').pop()!)}] }]
  }))
  const downloadFile = vi.fn(async () => ({
    statusCode: 200,
    tempFilePath: 'wxfile://temp/toilet.png'
  }))
  const saveFile = vi.fn(async () => ({
    savedFilePath: 'wxfile://saved/toilet.png'
  }))

  return {
    request,
    downloadFile,
    saveFile,
    port: createArasaacPictogramSearchPort({verifyImage: async () => ({status: 'available'}),
      request,
      downloadFile,
      saveFile
    })
  }
}

describe('ARASAAC pictogram search port', () => {
  test('uses qualified English fallback and preserves it through explicit caching', async () => {
    const request=vi.fn(async ({url}:{url:string})=>({statusCode:url.includes('/zh/')?404:200,
      data:url.includes('/zh/')?[]:[
        {_id:2855,keywords:[{keyword:'pills'}]},
        {_id:30117,keywords:[{keyword:'oral medication'},{keyword:'take medicines'}]}
      ]}))
    const downloadFile=vi.fn(async()=>({statusCode:200,tempFilePath:'tmp.png'}))
    const port=createArasaacPictogramSearchPort({verifyImage: async () => ({status: 'available'}),request,downloadFile,saveFile:async()=>({savedFilePath:'wxfile://saved/medicine.png'})})
    const result=await port.search(['吃药'])
    expect(request.mock.calls.map(([x])=>decodeURIComponent(x.url).split('/v1/')[1])).toEqual([
      'pictograms/zh/bestsearch/吃药','pictograms/zh/search/吃药','pictograms/en/bestsearch/take medicines'
    ])
    expect(result.value?.map(x=>x.pictogram.source.originalId)).toEqual(['30117'])
    expect(result.message).not.toContain('不可用')
    expect(downloadFile).not.toHaveBeenCalled()
    const picture=result.value![0].pictogram
    expect(picture.semantics).toMatchObject({queryText:'吃药',lookupText:'take medicines',sourceLanguage:'en',requiresReview:true})
    const cached=await port.cache(picture)
    expect(JSON.parse(JSON.stringify(cached.value))).toMatchObject({image:'wxfile://saved/medicine.png',semantics:picture.semantics})
  })
  test('distinguishes no matches from outage, without inventing an object substitute', async () => {
    const request=vi.fn(async()=>({statusCode:404,data:[]}))
    const port=createArasaacPictogramSearchPort({verifyImage: async () => ({status: 'available'}),request,downloadFile:vi.fn(),saveFile:vi.fn()})
    expect(await port.search(['回家'])).toEqual({ok:true,message:'暂时没有找到合适图片。',value:[]})
    // Two exact-language lookups plus the two bounded, audited semantic queries.
    expect(request).toHaveBeenCalledTimes(8)
  })
  test.each([['尿片', '2863'], ['一点点', '7209']])('reuses the reviewed lookup for %s and caches only on request', async (token, id) => {
    const harness = createHarness()
    harness.request.mockRejectedValue(new Error('synthetic provider offline'))
    const result = await harness.port.search([token])
    expect(result.value?.[0].token).toBe(token)
    expect(result.value?.[0].pictogram.source.originalId).toBe(id)
    expect(harness.downloadFile).not.toHaveBeenCalled()
    const cached = await harness.port.cache(result.value![0].pictogram)
    expect(cached.ok).toBe(true)
    expect(cached.value?.image).toBe('wxfile://saved/toilet.png')
    expect(cached.value?.source.originalId).toBe(id)
  })
  test('queries one bounded missing token at a time with source metadata', async () => {
    const harness = createHarness()
    const result = await harness.port.search([
      '厕所',
      '厕所',
      '',
      ...Array.from({ length: 20 }, (_, index) => `缺词${index}`)
    ])

    expect(result.ok).toBe(true)
    expect(harness.request).toHaveBeenCalledTimes(12)
    expect(harness.request.mock.calls[0][0]).toEqual({
      url: 'https://api.arasaac.org/v1/pictograms/zh/bestsearch/%E5%8E%95%E6%89%80',
      method: 'GET',
      header: { Accept: 'application/json' }
    })
    expect(result.value?.[0]).toEqual({
      token: '厕所',
      pictogram: expect.objectContaining({
        image:
          'https://static.arasaac.org/pictograms/37331/37331_300.png',
        source: expect.objectContaining({
          provider: 'arasaac',
          license: 'CC BY-NC-SA 4.0'
        })
      })
    })
  })

  test('downloads only the canonical confirmed ARASAAC image', async () => {
    const harness = createHarness()
    const search = await harness.port.search(['厕所'])
    const result = await harness.port.cache(search.value![0].pictogram)

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          image: 'wxfile://saved/toilet.png'
        })
      })
    )
    expect(harness.downloadFile).toHaveBeenCalledWith({
      url: 'https://static.arasaac.org/pictograms/37331/37331_300.png'
    })
  })

  test('keeps four ordered unique candidates for caregiver selection', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: [
        { _id: 1 },
        { _id: 2 },
        { _id: 1 },
        { _id: 3 },
        { _id: 4 },
        { _id: 5 }
      ].map(item => ({...item, keywords: [{keyword: '未收录词'}]}))
    })

    const result = await harness.port.search(['未收录词'])

    expect(
      result.value?.map(item => item.pictogram.source.originalId)
    ).toEqual(['1', '2', '3', '4'])
  })

  test('prioritizes PicInterpreter caregiver-reviewed ids', async () => {
    const harness = createHarness()
    harness.request.mockResolvedValueOnce({
      statusCode: 200,
      data: [999, 4676, 888].map(_id => ({_id, keywords: [{keyword: '慢慢'}]}))
    })

    const result = await harness.port.search(['慢慢'])

    expect(
      result.value?.map(item => item.pictogram.source.originalId)
    ).toEqual(['4676', '999', '888'])
    expect(result.message).toContain('人工审核候选')
  })

  test('returns a reviewed candidate when live search fails', async () => {
    const harness = createHarness()
    harness.request.mockRejectedValueOnce(new Error('offline'))

    await expect(harness.port.search(['慢慢'])).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        message: expect.stringContaining('人工审核候选'),
        value: [
          expect.objectContaining({
            token: '慢慢',
            pictogram: expect.objectContaining({
              source: expect.objectContaining({ originalId: '4676' })
            })
          })
        ]
      })
    )
    expect(harness.request).toHaveBeenCalledTimes(1)
  })

  test('keeps the legal-domain warning when a reviewed candidate is available', async () => {
    const harness = createHarness()
    harness.request.mockRejectedValueOnce({
      errMsg: 'request:fail url not in domain list'
    })

    await expect(harness.port.search(['慢慢'])).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        message: expect.stringContaining('搜索域名未配置'),
        value: [
          expect.objectContaining({
            pictogram: expect.objectContaining({
              source: expect.objectContaining({ originalId: '4676' })
            })
          })
        ]
      })
    )
  })

  test('falls back from ranked search to the broader ARASAAC endpoint', async () => {
    const harness = createHarness()
    harness.request
      .mockResolvedValueOnce({ statusCode: 200, data: [] })
      .mockResolvedValueOnce({ statusCode: 200, data: [{ _id: 456, keywords: [{keyword: '未收录词'}] }] })

    const result = await harness.port.search(['未收录词'])

    expect(result.value?.[0].pictogram.source.originalId).toBe('456')
    expect(harness.request.mock.calls.map(call => call[0].url)).toEqual([
      'https://api.arasaac.org/v1/pictograms/zh/bestsearch/%E6%9C%AA%E6%94%B6%E5%BD%95%E8%AF%8D',
      'https://api.arasaac.org/v1/pictograms/zh/search/%E6%9C%AA%E6%94%B6%E5%BD%95%E8%AF%8D'
    ])
  })

  test('does not label a compatibility-search result as caregiver reviewed', async () => {
    const harness = createHarness()
    harness.request
      .mockRejectedValueOnce(new Error('ranked search unavailable'))
      .mockResolvedValueOnce({ statusCode: 200, data: [{ _id: 456, keywords: [{keyword: '未收录词'}] }] })

    const result = await harness.port.search(['未收录词'])

    expect(result.ok).toBe(true)
    expect(result.message).toContain('兼容搜索候选')
    expect(result.message).not.toContain('人工审核候选')
  })

  test('rejects a candidate whose image URL was replaced', async () => {
    const harness = createHarness()
    const search = await harness.port.search(['厕所'])
    const candidate = search.value![0].pictogram

    await expect(
      harness.port.cache({
        ...candidate,
        image: 'https://evil.test/toilet.png'
      })
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, message: expect.stringContaining('来源无效') })
    )
    expect(harness.downloadFile).not.toHaveBeenCalled()
  })

  test('keeps offline communication available after a network failure', async () => {
    const harness = createHarness()
    harness.request.mockRejectedValue(new Error('offline'))

    await expect(harness.port.search(['未收录词'])).resolves.toEqual({
      ok: false,
      message: '在线图片服务不可用，已保留离线沟通功能。'
    })
  })

  test('explains the WeChat legal-domain gate without hiding the cause', async () => {
    const harness = createHarness()
    harness.request.mockRejectedValue({
      errMsg: 'request:fail url not in domain list'
    })

    await expect(harness.port.search(['未收录词'])).resolves.toEqual({
      ok: false,
      message:
        '请先在小程序“开发设置 → 服务器域名”中配置 ARASAAC 的 request 与 downloadFile 域名；离线沟通不受影响。'
    })
  })
})
