import { Button, Image, Text } from '@tarojs/components'
import {
  getPatientActionDefinition
} from '@cboard-communication-core/patientActionLanguage'
import backspaceIcon from '../../assets/cboard/output-backspace.svg'
import undoIcon from '../../assets/cboard/output-undo.svg'
import clearIcon from '../../assets/cboard/output-clear.svg'

const outputIcons = { backspace: backspaceIcon, undo: undoIcon, clear: clearIcon }

interface PatientActionButtonProps {
  action: string
  id?: string
  className?: string
  label?: string
  ariaLabel?: string
  disabled?: boolean
  outputIcon?: keyof typeof outputIcons
  onClick?: () => void
}

export default function PatientActionButton({
  action,
  id,
  className = '',
  label = '',
  ariaLabel = '',
  disabled = false,
  outputIcon,
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
      {outputIcon ? (
        <Image className='patient-action-button__icon' src={outputIcons[outputIcon]} mode='aspectFit' />
      ) : (
        <Text className='patient-action-button__glyph'>{definition.glyph}</Text>
      )}
      <Text className='patient-action-button__label'>
        {definition.label}
      </Text>
    </Button>
  )
}
