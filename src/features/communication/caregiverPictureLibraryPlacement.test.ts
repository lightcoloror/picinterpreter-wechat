import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function readSiblingSource(name: string) {
  return readFileSync(new URL(name, import.meta.url), 'utf8')
}

describe('caregiver picture library placement', () => {
  test('keeps cross-category search out of the patient expression workspace', () => {
    const patientWorkspace = readSiblingSource('./ExpressionWorkspace.tsx')
    const communicationPage = readSiblingSource('./CommunicationPage.tsx')

    expect(patientWorkspace).not.toContain('跨分类找图')
    expect(patientWorkspace).not.toContain('expression-search')
    expect(communicationPage).not.toContain('personal-image-manager-button')
    expect(communicationPage).not.toContain(
      '/packages/backup/pages/personal-images/index'
    )
  })

  test('exposes the search in picture library maintenance', () => {
    const pictureLibrary = readSiblingSource('./PersonalImageManager.tsx')
    const pictureLibraryStyles = readSiblingSource(
      './PersonalImageManager.css'
    )
    const caregiverSettings = readSiblingSource(
      './CommunicationSettingsPanel.tsx'
    )

    expect(pictureLibrary).toContain('跨分类找图')
    expect(pictureLibrary).toContain('personal-image-library-search')
    expect(pictureLibrary).toContain('personal-image-action--restore')
    expect(pictureLibraryStyles).toContain(
      '.personal-image-action--restore'
    )
    expect(pictureLibrary).toContain('公开图卡收纳')
    expect(pictureLibrary).toContain(
      'public-pictogram-target-board-picker'
    )
    expect(pictureLibrary).toContain(
      'open-board-manager-for-curation-button'
    )
    expect(caregiverSettings).toContain('图片库维护')
    expect(caregiverSettings).toContain(
      'open-picture-library-management-button'
    )
  })
})
