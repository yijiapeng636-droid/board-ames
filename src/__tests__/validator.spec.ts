import { describe, expect, it } from 'vitest'
import { validateAIMove } from '@/games/gomoku/ai/validator'
import { createBoard } from '@/games/gomoku/core/game'

describe('AI validator', () => {
  const candidates = [
    {
      row: 7,
      col: 8,
      staticScore: 100,
      searchScore: 120,
      features: ['positional'],
      principalVariation: [{ player: 'white' as const, row: 7, col: 8 }],
    },
  ]

  it('accepts a valid empty coordinate', () => {
    expect(
      validateAIMove(
        { row: 7, col: 8, reason: '防守' },
        createBoard(),
        'aiThinking',
        null,
        candidates,
      ),
    ).toEqual({
      row: 7,
      col: 8,
      reason: '防守',
    })
  })

  it.each([
    { row: 1.5, col: 2 },
    { row: -1, col: 2 },
    { row: 15, col: 2 },
    { row: 2, col: 15 },
  ])('rejects invalid coordinates: $row, $col', (move) => {
    expect(() => validateAIMove(move, createBoard(), 'aiThinking', null, candidates)).toThrow(
      /整数|范围/,
    )
  })

  it('rejects occupied coordinates and invalid phases', () => {
    const board = createBoard()
    board[4]![5] = 1
    expect(() => validateAIMove({ row: 4, col: 5 }, board, 'aiThinking', null, candidates)).toThrow(
      '已有',
    )
    expect(() => validateAIMove({ row: 4, col: 6 }, board, 'playerTurn', null, candidates)).toThrow(
      '阶段',
    )
    expect(() =>
      validateAIMove({ row: 4, col: 6 }, board, 'aiThinking', 'blackWin', candidates),
    ).toThrow('阶段')
  })

  it('rejects a legal empty coordinate outside the candidate list', () => {
    expect(() =>
      validateAIMove({ row: 6, col: 6 }, createBoard(), 'aiThinking', null, candidates),
    ).toThrow('不在候选点中')
  })
})
