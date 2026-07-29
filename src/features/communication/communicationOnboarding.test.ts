import { describe, expect, test } from 'vitest'
import { COMMUNICATION_ONBOARDING_CONTENT } from '@cboard-communication-core/communicationOnboarding'

describe('WeChat communication onboarding', () => {
  test('consumes the shared bidirectional and offline-first introduction', () => {
    expect(COMMUNICATION_ONBOARDING_CONTENT.title).toBe('图片帮助双方理解')
    expect(
      COMMUNICATION_ONBOARDING_CONTENT.steps.map(step => step.id)
    ).toEqual(['express', 'receive', 'offline'])
    expect(
      COMMUNICATION_ONBOARDING_CONTENT.steps.map(step => step.title)
    ).toEqual(['患者表达', '接收理解', '离线优先'])
  })
})
