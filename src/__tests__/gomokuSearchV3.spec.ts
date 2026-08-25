import { describe, expect, it } from 'vitest'
import { searchPosition } from '@/games/gomoku/ai/search'
import { searchForcedWin } from '@/games/gomoku/ai/threatSearch'
import { applyTTBound, classifyTTBound, type TTEntry } from '@/games/gomoku/ai/transposition'
import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

function boardWith(pieces: Array<[number, number, Player]>): Board {
  const board = createBoard()
  for (const [row, col, player] of pieces) board[row]![col] = player
  return board
}

describe('gomoku search V3 correctness', () => {
  it('classifies and applies TT exact/lower/upper bounds', () => {
    expect(classifyTTBound(4, 5, 10)).toBe('upper')
    expect(classifyTTBound(11, 5, 10)).toBe('lower')
    expect(classifyTTBound(7, 5, 10)).toBe('exact')
    const entry = (bound: TTEntry['bound'], score: number): TTEntry => ({ depth: 3, score, bound, principalVariation: [] })
    expect(applyTTBound(entry('lower', 8), 3, 7)).toMatchObject({ alpha: 8, usable: true })
    expect(applyTTBound(entry('upper', 2), 3, 7)).toMatchObject({ beta: 2, usable: true })
    expect(applyTTBound(entry('exact', 6), 3, 7)).toMatchObject({ score: 6, usable: true })
  })

  it('proves an open-four win and reports a consistent PV', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 2]])
    const result = searchForcedWin(board, 2, { maxPly: 5, maxMs: 1_000 })
    expect(result.forcedWin).toBe(true)
    expect(result.plyToWin).toBe(result.principalVariation.length)
    expect(result.winningMove).toEqual({ row: result.principalVariation[0]?.row, col: result.principalVariation[0]?.col })
  })

  it('does not call an unproved pair of open-threes a forced win', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [5, 7, 2], [6, 7, 2], [8, 8, 1]])
    const result = searchForcedWin(board, 2, { maxPly: 3, maxMs: 1_000 })
    expect(result.forcedWin).toBe(false)
  })

  it('does not claim a forced attack when the defender wins immediately', () => {
    const board = boardWith([
      [7, 5, 2], [7, 6, 2], [7, 7, 2],
      [3, 3, 1], [3, 4, 1], [3, 5, 1], [3, 6, 1],
    ])
    expect(searchForcedWin(board, 2, { maxPly: 7, maxMs: 1_000 }).forcedWin).toBe(false)
  })

  it('returns only the last completed layer on timeout', () => {
    const board = boardWith([[7, 7, 1], [7, 8, 2], [8, 7, 1]])
    const shallow = searchPosition(board, { rootPlayer: 2, maxDepth: 1, maxMs: 2_000 })
    const timed = searchPosition(board, { rootPlayer: 2, maxDepth: 8, maxMs: 40 })
    expect(timed.metrics.timedOut).toBe(true)
    expect(timed.metrics.searchDepth).toBeLessThan(8)
    const keptLastCompleteLayer = timed.metrics.searchDepth !== 1 || JSON.stringify(timed.candidates) === JSON.stringify(shallow.candidates)
    expect(keptLastCompleteLayer).toBe(true)
  })

  it('bounds tactical extension resources and keeps PV players alternating', () => {
    const board = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 1], [6, 7, 1]])
    const result = searchPosition(board, { rootPlayer: 2, maxDepth: 2, maxMs: 2_000, extensionDepth: 1, maxExtensionNodes: 12 })
    expect(result.metrics.extensionNodes).toBeLessThanOrEqual(12)
    const pv = result.candidates[0]?.principalVariation ?? []
    expect(pv.every((move, index) => index === 0 || move.player !== pv[index - 1]!.player)).toBe(true)
  })

  it.each([1, 2] as const)('uses the same search path for AI player %s', (rootPlayer) => {
    const board = boardWith([[7, 7, rootPlayer], [7, 8, rootPlayer], [6, 7, rootPlayer === 1 ? 2 : 1]])
    const result = searchPosition(board, { rootPlayer, maxDepth: 2, maxMs: 1_000 })
    expect(result.trace.aiPlayer).toBe(rootPlayer)
    expect(result.candidates[0]?.principalVariation[0]?.player).toBe(rootPlayer === 1 ? 'black' : 'white')
  })
})
