import { classifyImageReference } from '@cboard-communication-core/imageAvailability'
import type { ImageAvailability } from '@cboard-communication-core/imageAvailability'

export interface LocalImageVerificationDependencies {
  userDataPath: string
  read: (source: string) => Promise<ArrayBuffer | string>
  decode: (source: string) => Promise<{ width: number; height: number }>
}

export function createLocalImageVerifier(deps: LocalImageVerificationDependencies) {
  const bounded = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('local image check timeout')), 5000)
    work.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
  return async (source: string): Promise<ImageAvailability> => {
    const kind = classifyImageReference(source, deps.userDataPath)
    if (kind !== 'local-file' && kind !== 'packaged')
      return { status: kind === 'embedded' ? 'unverified' : kind as ImageAvailability['status'] }
    try {
      const bytes = await bounded(deps.read(source))
      if (!(typeof bytes === 'string' ? bytes.length : bytes && bytes.byteLength))
        return { status: 'corrupt' }
    } catch (error) {
      const message = String((error as { errMsg?: string })?.errMsg || error)
      return { status: /no such file|not exist|not found|ENOENT/i.test(message) ? 'missing' : 'check-failed' }
    }
    try {
      const decoded = await bounded(deps.decode(source))
      return decoded.width > 0 && decoded.height > 0
        ? { status: 'available', width: decoded.width, height: decoded.height }
        : { status: 'corrupt' }
    } catch (error) {
      const message = String((error as { errMsg?: string })?.errMsg || error)
      return { status: /decode|invalid|format|corrupt|image info/i.test(message) ? 'corrupt' : 'check-failed' }
    }
  }
}
