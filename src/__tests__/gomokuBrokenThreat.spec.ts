import { describe, expect, it } from 'vitest'
import { evaluateCandidate } from '@/games/gomoku/ai/candidates'
import { inspectPlayerPosition } from '@/games/gomoku/ai/evaluation'
import { analyzeThreat } from '@/games/gomoku/ai/threatAnalysis'
import { searchForcedWinFromMove } from '@/games/gomoku/ai/threatSearch'
import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

function boardWith(pieces: Array<[number, number, Player]>): Board {
  const board = createBoard()
  for (const [row, col, player] of pieces) board[row]![col] = player
  return board
}

describe('Gomoku broken threat analysis', () => {
  it('recognizes a jump four and keeps the winning gap as a forcing reply', () => {
    const board = boardWith([
      [7, 4, 2],
      [7, 5, 2],
      [7, 7, 2],
    ])
    const move = { row: 7, col: 8 }

    const analysis = analyzeThreat(board, move, 2)
    const candidate = evaluateCandidate(board, move.row, move.col, 2)

    expect(analysis.brokenFours).toHaveLength(1)
    expect(analysis.brokenFours[0]).toMatchObject({
      direction: 'horizontal',
      pattern: 'brokenFour',
      broken: true,
    })
    expect(analysis.winningMoves).toContainEqual({ row: 7, col: 6 })
    expect(analysis.defenseSquares).toContainEqual({ row: 7, col: 6 })
    expect(candidate.features).toContain('brokenFour')
    expect(candidate.forcesReply).toBe(true)
  })

  it('recognizes a jump three by the continuation that creates an open four', () => {
    const board = boardWith([
      [7, 4, 2],
      [7, 7, 2],
    ])
    const move = { row: 7, col: 5 }

    const analysis = analyzeThreat(board, move, 2)
    const brokenThree = analysis.brokenThrees[0]

    expect(brokenThree).toMatchObject({
      direction: 'horizontal',
      pattern: 'brokenThree',
      broken: true,
      length: 3,
    })
    expect(brokenThree?.continuationSquares).toEqual([{ row: 7, col: 6 }])
    expect(brokenThree?.defenseSquares).toEqual(
      expect.arrayContaining([
        { row: 7, col: 3 },
        { row: 7, col: 6 },
        { row: 7, col: 8 },
      ]),
    )

    const candidate = evaluateCandidate(board, move.row, move.col, 2)
    expect(candidate.features).toContain('brokenThree')
  })

  it('counts broken threes in board evaluation instead of dropping them as open twos', () => {
    const board = boardWith([
      [7, 4, 2],
      [7, 5, 2],
      [7, 7, 2],
    ])

    const facts = inspectPlayerPosition(board, 2)

    expect(facts.openThree).toBeGreaterThanOrEqual(1)
    expect(facts.forcingLines).toBeGreaterThanOrEqual(1)
  })

  it('proves a double jump-three fork through the same Threat Search used by the AI', () => {
    const board = boardWith([
      [7, 5, 2],
      [7, 8, 2],
      [5, 7, 2],
      [8, 7, 2],
    ])
    const move = { row: 7, col: 7 }

    const analysis = analyzeThreat(board, move, 2)
    expect(analysis.brokenThrees).toHaveLength(2)
    expect(analysis.doubleThreat).toBe(true)
    expect(analysis.forcingContinuations).toEqual(
      expect.arrayContaining([
        { row: 7, col: 6 },
        { row: 6, col: 7 },
      ]),
    )

    const proof = searchForcedWinFromMove(board, 2, move, {
      maxPly: 9,
      maxNodes: 20_000,
      maxMs: 2_000,
    })

    expect(proof.status).toBe('proven_win')
    expect(proof.winningMove).toEqual(move)
    expect(proof.principalVariation[0]).toMatchObject({
      player: 'white',
      row: move.row,
      col: move.col,
    })
  })
})
