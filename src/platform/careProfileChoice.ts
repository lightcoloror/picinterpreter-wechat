export interface CareChoicePorts {
  current(): boolean
  request(path: string, method: string, body?: unknown): Promise<any>
}
export interface CareChoiceOptions { persist?: boolean }

// Same contract as Web: only a current explicit choice may retry a conditional
// write. Restoring a GET/cache result never writes a new server preference.
export async function persistCareProfileChoice(profileId: string, ports: CareChoicePorts, options: CareChoiceOptions = {}) {
  if (options.persist === false) return ports.current()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!ports.current()) return false
    try {
      const context = await ports.request('/care/context', 'GET')
      if (!ports.current()) return false
      if (!Number.isSafeInteger(context?.selectionVersion) || context.selectionVersion < 0) {
        throw Object.assign(new Error('服务尚不支持档案选择版本核对，请稍后重试'), {
          status: 503, code: 'CARE_CONTEXT_VERSION_UNAVAILABLE'
        })
      }
      await ports.request('/care/context', 'PUT', { profileId, expectedSelectionVersion: context.selectionVersion })
      return ports.current()
    } catch (error: any) {
      if (!ports.current()) return false
      const conflict = error.status === 409 &&
        (error.code === 'CARE_CONTEXT_CHANGED' || error.data?.code === 'CARE_CONTEXT_CHANGED')
      if (conflict && attempt < 2) continue
      if (error.status) throw error
      // Preserve existing explicit offline entry, without claiming cloud sync.
      return true
    }
  }
  return false
}
