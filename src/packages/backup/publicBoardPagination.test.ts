import { describe, expect, test } from 'vitest'

import {
  hasMorePublicBoards,
  mergePublicBoardSearchPage
} from './publicBoardPagination'

const board = (id: string, name = id) => ({
  id,
  name,
  author: '照护者',
  tileCount: 1
})

describe('public board pagination', () => {
  test('replaces results for a new search', () => {
    expect(mergePublicBoardSearchPage(
      [board('old')],
      { boards: [board('new')], total: 1, page: 1 },
      false
    )).toEqual([board('new')])
  })

  test('appends pages while deduplicating stable board ids', () => {
    expect(mergePublicBoardSearchPage(
      [board('first'), board('shared', '旧标题')],
      {
        boards: [board('shared', '新标题'), board('last')],
        total: 3,
        page: 2
      },
      true
    )).toEqual([
      board('first'),
      board('shared', '新标题'),
      board('last')
    ])
  })

  test('reports whether the server has more public boards', () => {
    expect(hasMorePublicBoards(20, 21)).toBe(true)
    expect(hasMorePublicBoards(21, 21)).toBe(false)
    expect(hasMorePublicBoards(22, 21)).toBe(false)
  })
})
