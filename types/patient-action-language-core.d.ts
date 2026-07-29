declare module '@cboard-communication-core/patientActionLanguage' {
  export interface PatientActionDefinition {
    id: string
    icon: string
    glyph: string
    label: string
    ariaLabel: string
  }

  export const PATIENT_ACTION_IDS: Readonly<{
    express: string
    receive: string
    emergency: string
    play: string
    playAll: string
    stop: string
    confirm: string
    clear: string
    undo: string
    moveLeft: string
    moveRight: string
    remove: string
    replay: string
    save: string
    share: string
    back: string
    understood: string
    notUnderstood: string
    repeat: string
    fullscreen: string
    improve: string
  }>

  export function getPatientActionDefinition(
    id: string,
    overrides?: {
      label?: string
      ariaLabel?: string
    }
  ): PatientActionDefinition | null

  export function getPatientActionDefinitions(): PatientActionDefinition[]
}
