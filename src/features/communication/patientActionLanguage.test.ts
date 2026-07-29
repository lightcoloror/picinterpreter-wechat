import { describe, expect, test } from 'vitest'
import {
  PATIENT_ACTION_IDS,
  getPatientActionDefinition
} from '@cboard-communication-core/patientActionLanguage'

describe('WeChat patient action language', () => {
  test('reuses the shared semantic actions with lightweight glyphs', () => {
    const requiredActions = [
      PATIENT_ACTION_IDS.express,
      PATIENT_ACTION_IDS.receive,
      PATIENT_ACTION_IDS.emergency,
      PATIENT_ACTION_IDS.play,
      PATIENT_ACTION_IDS.confirm,
      PATIENT_ACTION_IDS.clear,
      PATIENT_ACTION_IDS.fullscreen,
      PATIENT_ACTION_IDS.understood,
      PATIENT_ACTION_IDS.notUnderstood,
      PATIENT_ACTION_IDS.repeat,
      PATIENT_ACTION_IDS.back
    ]

    requiredActions.forEach(action => {
      const definition = getPatientActionDefinition(action)
      expect(definition).toBeTruthy()
      expect(definition?.glyph).toBeTruthy()
      expect(definition?.ariaLabel).toBeTruthy()
    })
  })
})
