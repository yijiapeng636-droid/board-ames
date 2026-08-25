import { describe, expect, it } from 'vitest'
import { createCheckpoint } from '@/games/gomoku/core/checkpoint'
import { createBoard } from '@/games/gomoku/core/game'

describe('game checkpoint', () => {
  it('creates an isolated snapshot for undo', () => {
    const board = createBoard()
    board[7]![7] = 1
    const checkpoint = createCheckpoint({
      board,
      moves: [{ turn: 1, player: 1, row: 7, col: 7 }],
      currentPlayer: 2,
      bonusMoves: { human: 1, ai: 0 },
      phase: 'aiThinking',
      result: null,
      aiReason: '',
      error: '',
    })
    board[7]![7] = 2
    checkpoint.moves[0]!.row = 3

    expect(checkpoint.board[7]![7]).toBe(1)
    expect(checkpoint.moves[0]!.row).toBe(3)
    expect(checkpoint.bonusMoves).toEqual({ human: 1, ai: 0 })
  })
})
