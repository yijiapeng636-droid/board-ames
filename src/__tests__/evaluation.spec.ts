import { describe, expect, it } from 'vitest'
import { evaluatePosition, inspectLeafTactics, inspectPlayerPosition } from '@/games/gomoku/ai/evaluation'
import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

function boardWith(pieces: Array<[number, number, Player]>): Board {
  const board = createBoard()
  for (const [row, col, player] of pieces) board[row]![col] = player
  return board
}

describe('gomoku position evaluation', () => {
  it('is symmetric for black and white perspectives', () => {
    const board = boardWith([[7, 6, 1], [7, 7, 1], [6, 7, 2]])
    expect(evaluatePosition(board, 1)).toBe(-evaluatePosition(board, 2))
  })

  it('is invariant under swapping every stone color and perspective', () => {
    const black = boardWith([[7, 5, 1], [7, 6, 1], [6, 7, 2], [8, 8, 2]])
    const swapped = black.map((line) => line.map((piece) => (piece === 1 ? 2 : piece === 2 ? 1 : 0)))
    expect(evaluatePosition(black, 1)).toBe(evaluatePosition(swapped, 2))
  })

  it('does not value a blocked edge line as an open threat', () => {
    const open = boardWith([[7, 5, 1], [7, 6, 1], [7, 7, 1]])
    const blockedAtEdge = boardWith([[0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 2]])
    expect(evaluatePosition(open, 1)).toBeGreaterThan(evaluatePosition(blockedAtEdge, 1))
  })

  it('values a forcing threat above isolated connections', () => {
    const forcing = boardWith([[7, 5, 1], [7, 6, 1], [7, 7, 1], [7, 8, 1]])
    const isolated = boardWith([[3, 3, 1], [5, 5, 1], [7, 7, 1], [9, 9, 1]])
    expect(evaluatePosition(forcing, 1)).toBeGreaterThan(evaluatePosition(isolated, 1))
  })

  it('makes an opponent immediate threat clearly unfavorable', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 2], [7, 8, 2]])
    expect(evaluatePosition(board, 1)).toBeLessThan(-100_000)
  })

  it('values a double threat above two ordinary isolated pairs', () => {
    const doubleThreat = boardWith([[7, 5, 1], [7, 6, 1], [5, 7, 1], [6, 7, 1]])
    const pairs = boardWith([[3, 3, 1], [3, 4, 1], [10, 10, 1], [10, 11, 1]])
    expect(evaluatePosition(doubleThreat, 1)).toBeGreaterThan(evaluatePosition(pairs, 1))
  })

  it.each([
    ['XX_XX', [3, 4, 6, 7], 5, 'immediate'],
    ['X_XXX', [3, 5, 6, 7], 4, 'immediate'],
    ['XXX_X', [3, 4, 5, 7], 6, 'immediate'],
    ['X_XX_', [3, 5, 6], 4, 'forcing'],
    ['_XX_X', [4, 5, 7], 6, 'forcing'],
  ] as const)('recognizes concrete gap-completion tactic %s', (_name, columns, expectedCol, kind) => {
    const board = createBoard()
    for (const col of columns) board[7]![col] = 1
    const facts = inspectLeafTactics(board, 1)
    const moves = kind === 'immediate' ? facts.immediateWins : facts.forcingMoves
    expect(moves).toContainEqual({ row: 7, col: expectedCol })
  })

  it('does not turn unrelated open threes into a global multi-threat', () => {
    const board = boardWith([[3, 3, 1], [3, 4, 1], [3, 5, 1], [10, 9, 1], [10, 10, 1], [10, 11, 1]])
    expect(inspectPlayerPosition(board, 1).multiThreat).toBe(false)
    expect(inspectLeafTactics(board, 1).sameMoveMultiThreats).toHaveLength(0)
  })

  it('recognizes a multi-threat only when one concrete move creates multiple directions', () => {
    const board = boardWith([[7, 5, 1], [7, 6, 1], [5, 7, 1], [6, 7, 1]])
    expect(inspectLeafTactics(board, 1).sameMoveMultiThreats).toContainEqual({ row: 7, col: 7 })
  })

  it('makes an immediate tactic much stronger when its owner is side to move', () => {
    const board = boardWith([[7, 3, 1], [7, 4, 1], [7, 5, 1], [7, 6, 1]])
    expect(evaluatePosition(board, 1, 1)).toBeGreaterThan(evaluatePosition(board, 1, 2))
  })
})
