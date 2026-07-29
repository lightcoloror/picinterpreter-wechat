import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

function readProjectFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('receiver display orientation contract', () => {
  test('enables live page rotation and uses a native two-axis scroll view', () => {
    const pageConfig = readProjectFile(
      'src/packages/caregiver/pages/receiver/index.config.ts'
    )
    const component = readProjectFile(
      'src/features/communication/ReceiverDisplayPage.tsx'
    )

    expect(pageConfig).toContain("pageOrientation: 'auto'")
    expect(component).toContain("id='receiver-display-sequence'")
    expect(component).toContain('scrollX')
    expect(component).toContain('scrollY')
    expect(component).toContain('enableFlex')
  })

  test('keeps one vertical strip in portrait and one horizontal strip in landscape', () => {
    const css = readProjectFile(
      'src/features/communication/CommunicationPage.css'
    )
    const baseStart = css.indexOf('.receiver-display__grid {')
    const baseEnd = css.indexOf('.receiver-display__card {', baseStart)
    const landscapeStart = css.indexOf('@media (orientation: landscape)')
    const landscapeEnd = css.indexOf(
      '.receiver-display__image {',
      landscapeStart
    )
    const baseRule = css.slice(baseStart, baseEnd)
    const landscapeRule = css.slice(landscapeStart, landscapeEnd)

    expect(baseRule).toContain('display: flex')
    expect(baseRule).toContain('flex-direction: column')
    expect(baseRule).toContain('overflow-y: auto')
    expect(landscapeRule).toContain('flex-direction: row')
    expect(landscapeRule).toContain('overflow-x: auto')
    expect(landscapeRule).not.toContain('flex-wrap')
  })
})
