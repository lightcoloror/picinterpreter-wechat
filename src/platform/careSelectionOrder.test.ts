import { expect, test, vi } from 'vitest'
import { enterCareProfile } from './careProfileEntry'

const profile = (id: string) => ({ id, familyId: 'synthetic-family', relationship: { role: 'relative', defaultMode: 'receiver' } })
function fixture(request: any, current = () => true) {
  return { current, request, newId: vi.fn(async () => 'synthetic-operation'), select: vi.fn(),
    needsRole: vi.fn(), start: vi.fn(), sync: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }
}
const conflict = () => Object.assign(new Error('changed'), { status: 409, data: { code: 'CARE_CONTEXT_CHANGED' } })

test('restoring the server selection enters locally without a selection PUT', async () => {
  const ports = fixture(vi.fn(async () => ({ selectionVersion: 2 })))
  await enterCareProfile(profile('B'), ports, undefined, { persist: false })
  expect(ports.request).not.toHaveBeenCalled()
  expect(ports.select).toHaveBeenCalledWith(profile('B'))
  expect(ports.navigate).toHaveBeenCalledOnce()
})

test('a manual selection reads the version and conditionally writes the original intent', async () => {
  const request = vi.fn(async () => ({ selectionVersion: 7 }))
  await enterCareProfile(profile('B'), fixture(request))
  expect(request.mock.calls).toEqual([
    ['/care/context', 'GET'], ['/care/context', 'PUT', { profileId: 'B', expectedSelectionVersion: 7 }]
  ])
})

test('B commits before old A: stale A conflicts and cannot replace B locally or remotely', async () => {
  let version = 0, selected = '', aCurrent = true
  let releaseA!: () => void
  const gate = new Promise<void>(resolve => { releaseA = resolve })
  let aWaiting!: () => void
  const waiting = new Promise<void>(resolve => { aWaiting = resolve })
  const request = vi.fn(async (_path: string, method: string, body?: any) => {
    if (method === 'GET') return { selectionVersion: version }
    if (body.profileId === 'A') { aWaiting(); await gate }
    if (body.expectedSelectionVersion !== undefined && body.expectedSelectionVersion !== version) throw conflict()
    selected = body.profileId; version += 1
    return { selectionVersion: version }
  })
  const a = fixture(request, () => aCurrent), b = fixture(request)
  const pending = enterCareProfile(profile('A'), a)
  await waiting
  aCurrent = false
  await enterCareProfile(profile('B'), b)
  releaseA(); await pending
  expect(selected).toBe('B')
  expect(version).toBe(1)
  expect(a.select).not.toHaveBeenCalled()
  expect(a.navigate).not.toHaveBeenCalled()
  expect(b.select).toHaveBeenCalledWith(profile('B'))
})

test('only a current explicit intent retries a version conflict and re-reads the version', async () => {
  let puts = 0, version = 4
  const request = vi.fn(async (_path: string, method: string) => {
    if (method === 'GET') return { selectionVersion: version }
    if (++puts === 1) { version++; throw conflict() }
    return { selectionVersion: ++version }
  })
  const ports = fixture(request)
  await enterCareProfile(profile('B'), ports)
  expect(request.mock.calls.filter(c => c[1] === 'PUT').map(c => c[2])).toEqual([
    { profileId: 'B', expectedSelectionVersion: 4 }, { profileId: 'B', expectedSelectionVersion: 5 }
  ])
  expect(ports.select).toHaveBeenCalledOnce()
})

test('conflict retries are bounded at three writes and do not accept the stale selection', async () => {
  const request = vi.fn(async (_path: string, method: string) => {
    if (method === 'GET') return { selectionVersion: 3 }
    throw conflict()
  })
  const ports = fixture(request)
  await expect(enterCareProfile(profile('B'), ports)).rejects.toMatchObject({ status: 409 })
  expect(request.mock.calls.filter(c => c[1] === 'PUT')).toHaveLength(3)
  expect(ports.select).not.toHaveBeenCalled()
})

test('a missing version fails closed instead of making an unconditional write', async () => {
  const request = vi.fn(async () => ({})), ports = fixture(request)
  await expect(enterCareProfile(profile('B'), ports)).rejects.toMatchObject({ code: 'CARE_CONTEXT_VERSION_UNAVAILABLE' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(ports.select).not.toHaveBeenCalled()
})

test.each([401, 403, 503])('HTTP %s is not retried as a version conflict', async status => {
  const request = vi.fn(async (_path: string, method: string) => {
    if (method === 'GET') return { selectionVersion: 3 }
    throw Object.assign(new Error('synthetic rejection'), { status })
  })
  const ports = fixture(request)
  await expect(enterCareProfile(profile('B'), ports)).rejects.toMatchObject({ status })
  expect(request).toHaveBeenCalledTimes(2)
  expect(ports.select).not.toHaveBeenCalled()
})
