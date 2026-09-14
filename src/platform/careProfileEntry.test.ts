import { expect, test, vi } from 'vitest'
import { enterCareProfile } from './careProfileEntry'

const profile = { id: 'patient-a', familyId: 'family-a', relationship: { role: 'relative', defaultMode: 'receiver' } }
function fixture() {
  let active = true
  const ports = { current: () => active, request: vi.fn(async () => ({})), newId: vi.fn(async () => 'operation'),
    select: vi.fn(), needsRole: vi.fn(), start: vi.fn(), sync: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }
  return { ports, invalidate: () => { active = false } }
}

test('a network failure saves the known profile locally and still enters its existing mode', async () => {
  const { ports } = fixture()
  ports.request.mockRejectedValue(new Error('offline'))
  ports.sync.mockRejectedValue(new Error('offline'))
  await enterCareProfile(profile, ports)
  expect(ports.select).toHaveBeenCalledWith(profile)
  expect(ports.navigate).toHaveBeenCalledWith(profile)
})

test.each([401, 403])('an explicit HTTP %s does not save a selection or navigate', async status => {
  const { ports } = fixture()
  ports.request.mockRejectedValue(Object.assign(new Error('denied'), { status }))
  await expect(enterCareProfile(profile, ports)).rejects.toMatchObject({ status })
  expect(ports.select).not.toHaveBeenCalled()
  expect(ports.navigate).not.toHaveBeenCalled()
})

test('account or page changes during a context request cannot save into the next account', async () => {
  const { ports, invalidate } = fixture()
  ports.request.mockImplementation(async () => { invalidate(); return {} })
  await enterCareProfile(profile, ports)
  expect(ports.select).not.toHaveBeenCalled()
  expect(ports.start).not.toHaveBeenCalled()
  expect(ports.navigate).not.toHaveBeenCalled()
})

test('account changes during synchronization prevent the old profile redirect', async () => {
  const { ports, invalidate } = fixture()
  ports.sync.mockImplementation(async () => { invalidate() })
  await enterCareProfile(profile, ports)
  expect(ports.select).toHaveBeenCalledTimes(1)
  expect(ports.navigate).not.toHaveBeenCalled()
})

test('a role choice waits for online confirmation and checks identity before context writes', async () => {
  const { ports, invalidate } = fixture()
  ports.request.mockImplementation(async () => { invalidate(); return {} })
  await enterCareProfile({ ...profile, relationship: null }, ports, 'patient')
  expect(ports.request).toHaveBeenCalledTimes(1)
  expect(ports.request).toHaveBeenCalledWith('/care/profiles/patient-a/commands', 'POST', expect.objectContaining({ action: 'relationship' }))
  expect(ports.select).not.toHaveBeenCalled()
  expect(ports.navigate).not.toHaveBeenCalled()
})

test('a stale entry does not issue requests even before its first await', async () => {
  const { ports, invalidate } = fixture()
  invalidate()
  await enterCareProfile(profile, ports, 'patient')
  expect(ports.request).not.toHaveBeenCalled()
  expect(ports.newId).not.toHaveBeenCalled()
})
