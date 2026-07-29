import { Button, Text, View } from '@tarojs/components'
import { COMMUNICATION_ONBOARDING_CONTENT } from '@cboard-communication-core/communicationOnboarding'
import './CommunicationSettings.css'

interface CommunicationOnboardingProps {
  onComplete: () => void
}

export default function CommunicationOnboarding({
  onComplete
}: CommunicationOnboardingProps) {
  return (
    <View className='communication-onboarding'>
      <Text className='communication-onboarding__eyebrow'>图语家 · 第一次使用</Text>
      <Text className='communication-onboarding__title'>
        {COMMUNICATION_ONBOARDING_CONTENT.title}
      </Text>
      <View className='communication-onboarding__steps'>
        {COMMUNICATION_ONBOARDING_CONTENT.steps.map((step, index) => (
          <View className='communication-onboarding__step' key={step.id}>
            <Text className='communication-onboarding__index'>0{index + 1}</Text>
            <View>
              <Text className='communication-onboarding__step-title'>
                {step.title}
              </Text>
              <Text className='communication-onboarding__description'>
                {step.description}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Button
        id='complete-communication-onboarding-button'
        className='button button--primary communication-onboarding__start'
        onClick={onComplete}
      >
        开始使用
      </Button>
    </View>
  )
}
