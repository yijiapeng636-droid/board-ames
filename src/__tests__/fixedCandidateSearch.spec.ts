import { describe, expect, it } from 'vitest'
import { searchFixedCandidate } from '@/games/gomoku/ai/search'
import { searchForcedWinFromMove } from '@/games/gomoku/ai/threatSearch'
import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

function boardWith(pieces: Array<[number, number, Player]>): Board {
  const board = createBoard()
  for (const [row, col, player] of pieces) board[row]![col] = player
  return board
}

describe('fixed candidate continuation search', () => {
  it('continues normally from the opponent turn and keeps the fixed root move first', () => {
    const board = boardWith([[7, 7, 1], [8, 8, 2]])
    const result = searchFixedCandidate(board, { row: 7, col: 8 }, 1, { maxDepth: 3, maxMs: 2_000 })
    expect(result.completedDepth).toBe(3)
    expect(result.principalVariation[0]).toEqual({ player: 'black', row: 7, col: 8 })
    expect(result.principalVariation[1]?.player).toBe('white')
  })

  it('continues beyond a mandatory block instead of returning at the block shortcut', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 2]])
    const result = searchFixedCandidate(board, { row: 7, col: 8 }, 2, { maxDepth: 3, maxMs: 2_000 })
    expect(result.principalVariation).toHaveLength(3)
    expect(result.principalVariation.map((move) => move.player)).toEqual(['white', 'black', 'white'])
    expect(result.opponentBestReply).toEqual({ row: result.principalVariation[1]!.row, col: result.principalVariation[1]!.col })
    expect(result.forcedWin).toBe(true)
  })

  it('returns a terminal win when the fixed move directly completes five', () => {
    const board = boardWith([[7, 3, 1], [7, 4, 1], [7, 5, 1], [7, 6, 1]])
    const result = searchFixedCandidate(board, { row: 7, col: 7 }, 1, { maxDepth: 3, maxMs: 2_000 })
    expect(result.forcedWin).toBe(true)
    expect(result.principalVariation).toEqual([{ player: 'black', row: 7, col: 7 }])
  })

  it('scores a weak fixed move below a forcing fixed move', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 2], [4, 4, 1]])
    const forcing = searchFixedCandidate(board, { row: 7, col: 8 }, 2, { maxDepth: 3, maxMs: 2_000 })
    const weak = searchFixedCandidate(board, { row: 2, col: 2 }, 2, { maxDepth: 3, maxMs: 2_000 })
    expect(forcing.searchScore).toBeGreaterThan(weak.searchScore)
  })

  it.each([1, 2] as const)('keeps root perspective and PV color for player %s', (player) => {
    const board = boardWith([[7, 5, player], [7, 6, player], [7, 7, player]])
    const result = searchFixedCandidate(board, { row: 7, col: 8 }, player, { maxDepth: 3, maxMs: 2_000 })
    expect(result.principalVariation[0]?.player).toBe(player === 1 ? 'black' : 'white')
    expect(result.searchScore).toBeGreaterThan(0)
  })

  it('returns only the fixed root fallback when no iterative layer completes', () => {
    const result = searchFixedCandidate(createBoard(), { row: 7, col: 7 }, 1, { maxDepth: 8, maxMs: 0 })
    expect(result.completedDepth).toBe(0)
    expect(result.timedOut).toBe(true)
    expect(result.principalVariation).toEqual([{ player: 'black', row: 7, col: 7 }])
  })
})

describe('move-specific threat proof', () => {
  it('independently proves either of two winning entrances', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 2]])
    const left = searchForcedWinFromMove(board, 2, { row: 7, col: 4 }, { maxPly: 7, maxMs: 1_000 })
    const right = searchForcedWinFromMove(board, 2, { row: 7, col: 8 }, { maxPly: 7, maxMs: 1_000 })
    expect(left.status).toBe('proven_win')
    expect(right.status).toBe('proven_win')
    expect(left.principalVariation[0]).toMatchObject({ row: 7, col: 4 })
    expect(right.principalVariation[0]).toMatchObject({ row: 7, col: 8 })
  })

  it('reports timeout separately and never turns it into a proven win', () => {
    const result = searchForcedWinFromMove(createBoard(), 1, { row: 7, col: 7 }, { maxPly: 9, maxMs: 0 })
    expect(result.status).toBe('timeout')
    expect(result.forcedWin).toBe(false)
  })
})
