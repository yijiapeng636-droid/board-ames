import { describe, expect, it } from 'vitest'
import { generateCandidatePool } from '@/games/gomoku/ai/candidates'
import {
  createSafeSearchFallback,
  getSearchTerminalScore,
  searchPosition,
} from '@/games/gomoku/ai/search'
import { SEARCH_WIN_SCORE } from '@/games/gomoku/ai/searchConfig'
import { handleSearchWorkerRequest } from '@/games/gomoku/ai/searchWorkerProtocol'
import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

function boardWith(pieces: Array<[number, number, Player]>): Board {
  const board = createBoard()
  for (const [row, col, player] of pieces) board[row]![col] = player
  return board
}

describe('search engine', () => {
  it('scores terminal wins above ordinary positions and prefers a later loss', () => {
    const whiteWin = boardWith([
      [7, 3, 2],
      [7, 4, 2],
      [7, 5, 2],
      [7, 6, 2],
      [7, 7, 2],
    ])
    const blackWin = boardWith([
      [3, 8, 1],
      [4, 8, 1],
      [5, 8, 1],
      [6, 8, 1],
      [7, 8, 1],
    ])
    expect(getSearchTerminalScore(whiteWin, 7, 7, 2)).toBe(SEARCH_WIN_SCORE - 2)
    expect(getSearchTerminalScore(blackWin, 7, 8, 2)).toBe(-SEARCH_WIN_SCORE + 2)
    expect(getSearchTerminalScore(blackWin, 7, 8, 4)).toBeGreaterThan(
      getSearchTerminalScore(blackWin, 7, 8, 2)!,
    )

    const draw = createBoard()
    for (let row = 0; row < 15; row += 1) {
      for (let col = 0; col < 15; col += 1) {
        draw[row]![col] = (row + col * 2) % 4 < 2 ? 1 : 2
      }
    }
    expect(getSearchTerminalScore(draw, 14, 14, 1)).toBe(0)
  })

  it('returns immediate wins and forced blocks without deeper search', () => {
    const winning = createBoard()
    const blocking = createBoard()
    for (let col = 3; col < 7; col += 1) winning[7]![col] = 2
    for (let row = 3; row < 7; row += 1) blocking[row]![8] = 1
    blocking[2]![8] = 2
    expect(searchPosition(winning).forcedMoveType).toBe('forcedWin')
    expect(searchPosition(blocking).forcedMoveType).toBe('forcedBlock')
  })

  it('does not report a forced block when the opponent has two independent winning squares', () => {
    const board = createBoard()
    for (let col = 4; col < 8; col += 1) board[7]![col] = 1

    expect(searchPosition(board, { rootPlayer: 2, maxMs: 0 }).forcedMoveType).toBeNull()
  })

  it('restricts root candidates to next-turn-fork defenses even when search has no time', () => {
    const board = createBoard()
    board[7]![6] = 2
    board[7]![7] = 2
    board[7]![8] = 2

    const result = searchPosition(board, { rootPlayer: 1, maxMs: 0 })
    expect(result.candidates.map(({ row, col }) => [row, col])).toEqual([
      [7, 5],
      [7, 9],
    ])
  })

  it('uses multi-ply search to override a lower-quality static ordering and records PV', () => {
    const board = boardWith([
      [5, 5, 2],
      [5, 6, 2],
      [7, 5, 1],
      [7, 6, 1],
      [6, 7, 2],
      [8, 7, 1],
      [9, 8, 2],
      [6, 8, 1],
    ])
    const before = board.map((line) => [...line])
    const staticBest = generateCandidatePool(board)[0]!
    // This is a depth-correctness fixture; performance budgets are asserted separately.
    const result = searchPosition(board, { maxDepth: 3, maxMs: 5_000 })
    const searchedBest = result.candidates[0]!

    expect([searchedBest.row, searchedBest.col]).not.toEqual([staticBest.row, staticBest.col])
    expect(searchedBest.staticScore).toBeLessThan(staticBest.score)
    expect(searchedBest.principalVariation).toHaveLength(3)
    expect(result.metrics.searchDepth).toBe(3)
    expect(result.metrics.cutoffCount).toBeGreaterThan(0)
    expect(board).toEqual(before)
  })

  it('returns the last safe candidate set when the time budget is exhausted', () => {
    const board = boardWith([[7, 7, 1]])
    const result = searchPosition(board, { maxDepth: 3, maxMs: 0 })
    expect(result.metrics.timedOut).toBe(true)
    expect(result.metrics.searchDepth).toBe(0)
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(board[result.candidates[0]!.row]?.[result.candidates[0]!.col]).toBe(0)
  })

  it('keeps the same best move with and without the transposition cache', () => {
    const board = boardWith([
      [7, 7, 1],
      [7, 8, 2],
      [6, 7, 1],
      [8, 7, 2],
      [6, 6, 1],
      [8, 8, 2],
    ])
    const cached = searchPosition(board, { maxDepth: 3, maxMs: 2_000, useCache: true })
    const uncached = searchPosition(board, { maxDepth: 3, maxMs: 2_000, useCache: false })
    expect(cached.candidates[0]).toMatchObject({
      row: uncached.candidates[0]?.row,
      col: uncached.candidates[0]?.col,
      searchScore: uncached.candidates[0]?.searchScore,
    })
    expect(cached.metrics.cacheHits).toBeGreaterThan(0)
  })

  it('keeps forced moves in the safe fallback and worker protocol', () => {
    const board = createBoard()
    for (let col = 3; col < 7; col += 1) board[7]![col] = 2
    expect(createSafeSearchFallback(board).forcedMoveType).toBe('forcedWin')
    const response = handleSearchWorkerRequest({ id: 42, board })
    expect(response).toMatchObject({
      id: 42,
      ok: true,
      result: { forcedMoveType: 'forcedWin' },
    })
  })
})
