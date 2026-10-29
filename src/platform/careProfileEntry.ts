import type { CareSelection } from './taroCareContext'
import { persistCareProfileChoice, type CareChoiceOptions } from './careProfileChoice'

interface EntryPorts {
  current(): boolean
  request(path: string, method: string, body?: unknown): Promise<any>
  newId(): Promise<string>
  select(profile: CareSelection): void
  needsRole(profile: CareSelection): void
  start(): void
  sync(): Promise<unknown>
  navigate(profile: CareSelection): Promise<unknown>
}

// A completed request belongs to the account and page generation that started it.
export async function enterCareProfile(profile: CareSelection, ports: EntryPorts, role?: string, options: CareChoiceOptions = {}) {
  if (!ports.current()) return
  if (role) {
    const operationId = await ports.newId()
    if (!ports.current()) return
    await ports.request(`/care/profiles/${profile.id}/commands`, 'POST', {
      action: 'relationship', operationId, value: { role }
    })
    if (!ports.current()) return
    profile = { ...profile, relationship: { role, defaultMode: role === 'patient' ? 'expression' : 'receiver' } }
  }
  if (!profile.relationship) { ports.needsRole(profile); return }
  if (!await persistCareProfileChoice(profile.id, ports, options)) return
  if (!ports.current()) return
  ports.select(profile)
  ports.start()
  await ports.sync().catch(() => undefined)
  if (ports.current()) await ports.navigate(profile)
}
