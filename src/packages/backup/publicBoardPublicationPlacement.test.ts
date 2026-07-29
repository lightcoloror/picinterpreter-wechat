import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function readSource(name: string) {
  return readFileSync(new URL(name, import.meta.url), 'utf8')
}

describe('public board publication placement', () => {
  test('keeps publication in caregiver picture-library maintenance', () => {
    const personalImagesPage = readSource(
      './pages/personal-images/index.tsx'
    )
    const patientWorkspace = readSource(
      '../../features/communication/ExpressionWorkspace.tsx'
    )

    expect(personalImagesPage).toContain('PublicBoardPublisher')
    expect(personalImagesPage).toContain(
      '<PublicBoardPublisher boards={libraryBoards} />'
    )
    expect(patientWorkspace).not.toContain('PublicBoardPublisher')
  })

  test('requires two explicit consents and a final modal', () => {
    const publisher = readSource('./PublicBoardPublisher.tsx')

    expect(publisher).toContain(
      "id='public-board-publication-rights-switch'"
    )
    expect(publisher).toContain(
      "id='public-board-publication-privacy-switch'"
    )
    expect(publisher).toContain("title: '确认公开发布'")
    expect(publisher).toContain("confirmText: '确认公开'")
  })

  test('reuses CBoard owner actions for the complete publication lifecycle', () => {
    const publisher = readSource('./PublicBoardPublisher.tsx')

    expect(publisher).toContain('我的 CBoard 公共板')
    expect(publisher).toContain("title: '确认取消公开'")
    expect(publisher).toContain("title: '确认永久删除云端板'")
    expect(publisher).toContain('managementService.unpublishBoard')
    expect(publisher).toContain('managementService.deleteBoard')
  })
})
