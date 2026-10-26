import { describe, it, expect, vi } from 'vitest'
import { createLocalImageVerifier } from './localImageVerification'

describe('local image verification without network', () => {
  const setup = () => {
    const read = vi.fn(async () => new ArrayBuffer(8))
    const decode = vi.fn(async () => ({ width: 4, height: 4 }))
    return { read, decode, verify: createLocalImageVerifier({ userDataPath: 'wxfile://usr', read, decode }) }
  }
  it.each(['https://photos.example.test/private.png', 'blob:temporary', 'wxfile://tmp/a.png', 'http://tmp/a.png'])('never loads remote or transient source %s', async source => {
    const h = setup(); expect((await h.verify(source)).status).not.toBe('available')
    expect(h.read).not.toHaveBeenCalled(); expect(h.decode).not.toHaveBeenCalled()
  })
  it('requires actual bytes and decode, for user files and packaged images', async () => {
    const h = setup()
    expect((await h.verify('wxfile://usr/a.png')).status).toBe('available')
    expect((await h.verify('/assets/cboard-default/a.png')).status).toBe('available')
    expect((await h.verify('http://store/synthetic.jpg')).status).toBe('available')
    expect(h.read).toHaveBeenCalledTimes(3); expect(h.decode).toHaveBeenCalledTimes(3)
  })
  it('distinguishes missing from permission/read failure', async () => {
    const h = setup(); h.read.mockRejectedValueOnce(new Error('ENOENT'))
    expect((await h.verify('wxfile://usr/a.png')).status).toBe('missing')
    h.read.mockRejectedValueOnce({ errMsg: 'readFile:fail http://store/synthetic.jpg not found' })
    expect((await h.verify('http://store/synthetic.jpg')).status).toBe('missing')
    h.read.mockRejectedValueOnce(new Error('permission denied'))
    expect((await h.verify('wxfile://usr/a.png')).status).toBe('check-failed')
    expect(h.decode).not.toHaveBeenCalled()
  })
  it('does not accept an empty or undecodable file', async () => {
    const h = setup(); h.read.mockResolvedValueOnce(new ArrayBuffer(0))
    expect((await h.verify('wxfile://usr/a.png')).status).toBe('corrupt')
    h.decode.mockRejectedValueOnce(new Error('decode failed'))
    expect((await h.verify('wxfile://usr/a.png')).status).toBe('corrupt')
  })
})
