import { Button, Text, View } from '@tarojs/components'
import type { BoardDTO } from '@cboard-communication-core/dto'

import {
  getActiveNavigationBoard,
  navigateToPreviousBoard,
  navigateToRootBoard,
  type BoardNavigationState
} from './boardNavigation'

interface BoardNavigatorProps {
  boards: BoardDTO[]
  state: BoardNavigationState
  onChange: (state: BoardNavigationState) => void
}

export default function BoardNavigator({
  boards,
  state,
  onChange
}: BoardNavigatorProps) {
  const activeBoard = getActiveNavigationBoard(boards, state)
  const canGoBack = state.trail.length > 0
  const isRoot = Boolean(activeBoard && activeBoard.id === 'root') && !canGoBack

  return (
    <View className='board-navigator'>
      <View className='board-navigator__controls'>
        <Button
          className='board-nav-action'
          disabled={!canGoBack}
          onClick={() =>
            onChange(navigateToPreviousBoard(boards, state))
          }
        >
          返回
        </Button>
        <View className='board-navigator__current'>
          <Text className='board-navigator__current-name'>
            {activeBoard ? activeBoard.name : '默认图板'}
          </Text>
          <Text className='board-navigator__current-count'>
            {activeBoard ? activeBoard.tiles.length : 0} 张
          </Text>
        </View>
        <Button
          className='board-nav-action board-nav-action--home'
          disabled={isRoot}
          onClick={() => onChange(navigateToRootBoard(boards, state))}
        >
          回到首页
        </Button>
      </View>
    </View>
  )
}
