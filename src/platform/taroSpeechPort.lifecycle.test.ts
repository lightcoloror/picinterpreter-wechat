import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cboardApiSpeechPort, wechatSpeechPort } from './taroSpeechPort'

const fixtures = vi.hoisted(() => ({
  request: vi.fn(), writeFile: vi.fn(), unlink: vi.fn(), createAudio: vi.fn()
}))
vi.mock('@tarojs/taro', () => ({ default: {
  env: { USER_DATA_PATH: 'wxfile://synthetic-speech' },
  request: fixtures.request,
  createInnerAudioContext: fixtures.createAudio,
  getFileSystemManager: () => ({ writeFile: fixtures.writeFile, unlink: fixtures.unlink })
} }))
vi.mock('../config/runtimeCapabilities', () => ({ apiBaseUrlFor: () => 'https://synthetic.example.test' }))
vi.mock('./taroCboardAccountPort', () => ({ taroCboardSessionStore: { getAuthToken: () => 'synthetic-token' } }))
vi.mock('./taroCommunicationPreferencesStore', () => ({ taroCommunicationPreferencesStore: { load: () => ({ speechVoice: '' }) } }))

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve() }
const audioFixture = () => {
  let ended = () => {}, failed = () => {}
  return {
    src: '', autoplay: false, play: vi.fn(), stop: vi.fn(), destroy: vi.fn(),
    onEnded: (callback: () => void) => { ended = callback },
    onError: (callback: () => void) => { failed = callback },
    end: () => ended(), fail: () => failed()
  }
}

describe('actual Taro speech wiring with synthetic file callbacks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    fixtures.request.mockResolvedValue({ statusCode: 200, data: new Uint8Array([1, 2, 3]).buffer })
    fixtures.createAudio.mockImplementation(audioFixture)
    fixtures.unlink.mockImplementation(options => options.success())
  })
  afterEach(async () => { wechatSpeechPort.stop(); await flush(); vi.clearAllTimers(); vi.useRealTimers() })

  test('late failure while saving an old file does not stop the newer sentence', async () => {
    const first = cboardApiSpeechPort.speak('合成旧句')
    await flush()
    const oldWrite = fixtures.writeFile.mock.calls[0][0]
    const next = cboardApiSpeechPort.speak('合成新句')
    await flush()
    fixtures.writeFile.mock.calls[1][0].success()
    await flush()
    const audio = fixtures.createAudio.mock.results[0].value
    oldWrite.fail(new Error('synthetic disk failure'))
    await flush()
    expect(audio.destroy).not.toHaveBeenCalled()
    audio.end()
    await expect(first).resolves.toMatchObject({ reason: 'stopped' })
    await expect(next).resolves.toMatchObject({ ok: true })
  })
  test('old completed writes and cleanup cannot overwrite or delete the newer audio path', async () => {
    const first = cboardApiSpeechPort.speak('合成旧句')
    await flush()
    const oldWrite = fixtures.writeFile.mock.calls[0][0]
    const second = cboardApiSpeechPort.speak('合成新句')
    await flush()
    const newWrite = fixtures.writeFile.mock.calls[1][0]
    expect(oldWrite.filePath).not.toBe(newWrite.filePath)
    newWrite.success()
    await flush()
    const audio = fixtures.createAudio.mock.results[0].value
    oldWrite.success()
    await flush()
    expect(fixtures.unlink.mock.calls.map(call => call[0].filePath)).toContain(oldWrite.filePath)
    expect(fixtures.unlink.mock.calls.map(call => call[0].filePath)).not.toContain(newWrite.filePath)
    expect(audio.destroy).not.toHaveBeenCalled()
    audio.end()
    await expect(first).resolves.toMatchObject({ reason: 'stopped' })
    await expect(second).resolves.toMatchObject({ ok: true })
  })
  test('file cleanup without a platform callback does not keep a completed playback pending', async () => {
    fixtures.writeFile.mockImplementation(options => options.success())
    fixtures.unlink.mockImplementation(() => {})
    let result: unknown
    void cboardApiSpeechPort.speak('合成结束').then(value => { result = value })
    await flush()
    fixtures.createAudio.mock.results[0].value.end()
    await flush()
    expect(result).toMatchObject({ ok: true })
    expect(fixtures.unlink).toHaveBeenCalledTimes(1)
  })
  test('timed-out file writes remain canceled after their success callback arrives', async () => {
    const result = cboardApiSpeechPort.speak('合成超时')
    await flush()
    const pendingWrite = fixtures.writeFile.mock.calls[0][0]
    vi.advanceTimersByTime(30000)
    await expect(result).resolves.toMatchObject({ reason: 'timeout' })
    pendingWrite.success()
    await flush()
    expect(fixtures.createAudio).not.toHaveBeenCalled()
    expect(fixtures.unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath: pendingWrite.filePath }))
  })
  test('a partial write failure removes only its own path and settles even without unlink callback', async () => {
    fixtures.unlink.mockImplementation(() => {})
    const result = cboardApiSpeechPort.speak('合成写入失败')
    await flush()
    const write = fixtures.writeFile.mock.calls[0][0]
    write.fail(new Error('synthetic write failure'))
    await expect(result).resolves.toMatchObject({ ok: false, reason: 'playback' })
    expect(fixtures.unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath: write.filePath }))
    expect(fixtures.createAudio).not.toHaveBeenCalled()
  })
  test('repeated normal playback cleans every unique file without retaining a shared current file', async () => {
    fixtures.writeFile.mockImplementation(options => options.success())
    const paths: string[] = []
    for (let i = 0; i < 12; i++) {
      const pending = cboardApiSpeechPort.speak('合成循环')
      await flush()
      const audio = fixtures.createAudio.mock.results[i].value
      paths.push(audio.src)
      audio.end()
      await expect(pending).resolves.toMatchObject({ ok: true })
    }
    expect(new Set(paths).size).toBe(12)
    expect(fixtures.unlink.mock.calls.map(call => call[0].filePath)).toEqual(paths)
    expect(paths.every(path => /^wxfile:\/\/synthetic-speech\/picinterpreter-tts-[a-z0-9-]+\.mp3$/.test(path))).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  test('old device end/error callbacks cannot destroy a replacement playback', async () => {
    fixtures.writeFile.mockImplementation(options => options.success())
    const first = cboardApiSpeechPort.speak('合成旧音频')
    await flush()
    const oldAudio = fixtures.createAudio.mock.results[0].value
    const next = cboardApiSpeechPort.speak('合成新音频')
    await flush()
    const newAudio = fixtures.createAudio.mock.results[1].value
    oldAudio.end()
    oldAudio.fail()
    await flush()
    expect(newAudio.destroy).not.toHaveBeenCalled()
    newAudio.end()
    await expect(first).resolves.toMatchObject({ reason: 'stopped' })
    await expect(next).resolves.toMatchObject({ ok: true })
  })
  test('stop during delayed cleanup settles before new playback starts', async () => {
    fixtures.writeFile.mockImplementation(options => options.success())
    fixtures.unlink.mockImplementation(() => {})
    let result: unknown
    void cboardApiSpeechPort.speak('合成停止').then(value => { result = value })
    await flush()
    cboardApiSpeechPort.stop()
    await flush()
    expect(result).toMatchObject({ reason: 'stopped' })
    const next = cboardApiSpeechPort.speak('合成恢复')
    await flush()
    const oldCleanup = fixtures.unlink.mock.calls[0][0]
    oldCleanup.success()
    const newAudio = fixtures.createAudio.mock.results[1].value
    expect(newAudio.destroy).not.toHaveBeenCalled()
    newAudio.end()
    await expect(next).resolves.toMatchObject({ ok: true })
  })
  test('actual preferred/fallback/server chain sends nothing after stop and can replay a new original sentence', async () => {
    const canceled = wechatSpeechPort.speak('合成取消的旧句')
    wechatSpeechPort.stop()
    await expect(canceled).resolves.toMatchObject({ reason: 'stopped' })
    await flush()
    expect(fixtures.request).not.toHaveBeenCalled()

    fixtures.writeFile.mockImplementation(options => options.success())
    const replay = wechatSpeechPort.speak('我不想吃饭', { rate: 0.8, voice: 'synthetic' })
    await flush()
    expect(fixtures.request).toHaveBeenCalledTimes(1)
    expect(fixtures.request.mock.calls[0][0].data).toEqual({ text: '我不想吃饭', rate: 0.8, voice: 'synthetic' })
    fixtures.createAudio.mock.results[0].value.end()
    await expect(replay).resolves.toMatchObject({ ok: true })
  })
  test('actual adapter chain allows retry after a synthetic network failure without writing audio', async () => {
    fixtures.request.mockRejectedValueOnce(new Error('synthetic offline'))
    await expect(wechatSpeechPort.speak('合成断网')).resolves.toMatchObject({ ok: false, reason: 'network' })
    expect(fixtures.writeFile).not.toHaveBeenCalled()
    fixtures.writeFile.mockImplementation(options => options.success())
    const recovered = wechatSpeechPort.speak('合成重新连接')
    await flush()
    fixtures.createAudio.mock.results[0].value.end()
    await expect(recovered).resolves.toMatchObject({ ok: true })
    expect(fixtures.request).toHaveBeenCalledTimes(2)
  })
})
