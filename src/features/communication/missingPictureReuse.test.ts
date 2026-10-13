import { expect, test } from 'vitest'
import { DEFAULT_BOARD_FIXTURES } from '../../fixtures/defaultBoard'
import { runReceiverSession } from './receiverSession'

test.each([
  ['我想洗澡', '洗澡', 'rJK_QRq6m5K-'],
  ['我想睡觉', '睡觉', 'Syn2Q0cp7cYb'],
  ['停下来', '停下来', 'pi-home-stop']
])('reuses the same default picture on the mini program: %s', (text, token, id) => {
  const state = runReceiverSession(text, DEFAULT_BOARD_FIXTURES)
  expect(state.reviewItems.find(item => item.token === token)?.tile?.id).toBe(id)
  expect(state.outputPreview.map(item=>item.vocalization).join('')).toBe(text)
})
