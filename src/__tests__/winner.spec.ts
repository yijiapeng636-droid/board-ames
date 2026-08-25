import { describe, expect, it } from 'vitest'
import { createBoard } from '@/games/gomoku/core/game'
import { hasWinner } from '@/games/gomoku/core/winner'

describe('winner', () => {
  it.each([
    [
      [0, 1],
      [7, 3],
    ],
    [
      [1, 0],
      [3, 7],
    ],
    [
      [1, 1],
      [2, 2],
    ],
    [
      [1, -1],
      [2, 12],
    ],
  ] as const)(
    'detects five or more in each direction',
    ([rowStep, colStep], [startRow, startCol]) => {
      const board = createBoard()
      for (let index = 0; index < 6; index += 1) {
        board[startRow + rowStep * index]![startCol + colStep * index] = 1
      }
      expect(hasWinner(board, startRow + rowStep * 5, startCol + colStep * 5)).toBe(true)
    },
  )

  it('handles an edge without wrapping to another row', () => {
    const board = createBoard()
    board[0]![12] = 2
    board[0]![13] = 2
    board[0]![14] = 2
    board[1]![0] = 2
    board[1]![1] = 2
    expect(hasWinner(board, 0, 14)).toBe(false)
  })
})
