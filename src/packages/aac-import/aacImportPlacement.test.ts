import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function readSource(name: string) {
  return readFileSync(new URL(name, import.meta.url), 'utf8')
}

describe('AAC import package placement', () => {
  test('keeps the low-frequency importer in an independent subpackage', () => {
    const appConfig = readSource('../../app.config.ts')
    const backupPage = readSource('../backup/pages/library/index.tsx')
    const importPage = readSource('./pages/index/index.tsx')

    expect(appConfig).toContain("root: 'packages/aac-import'")
    expect(backupPage).toContain(
      '/packages/aac-import/pages/index/index'
    )
    expect(backupPage).not.toContain(
      'taroCommunicationAacImportPort'
    )
    expect(importPage).toContain('createOpenBoardImportService')
    expect(importPage).toContain('open-board-import-button')
  })

  test('keeps AAC file import out of the patient expression flow', () => {
    const communicationPage = readSource(
      '../../features/communication/CommunicationPage.tsx'
    )
    const expressionWorkspace = readSource(
      '../../features/communication/ExpressionWorkspace.tsx'
    )

    expect(communicationPage).not.toContain('packages/aac-import')
    expect(expressionWorkspace).not.toContain('packages/aac-import')
    expect(expressionWorkspace).not.toContain('open-board-import-button')
  })
})
