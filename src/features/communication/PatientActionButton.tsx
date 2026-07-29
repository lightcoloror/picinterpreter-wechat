import { Button, Text } from '@tarojs/components'
import {
  getPatientActionDefinition
} from '@cboard-communication-core/patientActionLanguage'

interface PatientActionButtonProps {
  action: string
  id?: string
  className?: string
  label?: string
  ariaLabel?: string
  disabled?: boolean
  onClick?: () => void
}

export default function PatientActionButton({
  action,
  id,
  className = '',
  label = '',
  ariaLabel = '',
  disabled = false,
  onClick
}: PatientActionButtonProps) {
  const definition = getPatientActionDefinition(action, {
    label,
    ariaLabel
  })
  if (!definition) return null

  return (
    <Button
      id={id}
      className={['patient-action-button', className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      ariaLabel={definition.ariaLabel}
      data-patient-action={definition.id}
      onClick={onClick}
    >
      <Text className='patient-action-button__glyph'>
        {definition.glyph}
      </Text>
      <Text className='patient-action-button__label'>
        {definition.label}
      </Text>
    </Button>
  )
}
