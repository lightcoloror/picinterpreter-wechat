import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const FEATURE_MANIFEST_FILE = 'release-feature-manifest.json'

export function buildArtifactFingerprint(distRoot) {
  const files = []
  function visit(relative = '') {
    const directory = path.join(distRoot, relative)
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (child.replace(/\\/g, '/') !== FEATURE_MANIFEST_FILE) files.push(child)
    }
  }
  visit()
  const hash = createHash('sha256')
  for (const file of files) hash.update(file.replace(/\\/g, '/')).update('\0').update(readFileSync(path.join(distRoot, file))).update('\n')
  return hash.digest('hex')
}

export function readBuiltFeatureManifest(distRoot) {
  const manifestPath = path.join(distRoot, FEATURE_MANIFEST_FILE)
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (_) {
    return null
  }
}
