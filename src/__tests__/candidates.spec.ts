import { describe, expect, it } from 'vitest'
import { analyzeMovePatterns, generateCandidatePool } from '@/games/gomoku/ai/candidates'
import { createBoard } from '@/games/gomoku/core/game'

describe('AI candidates', () => {
  it('starts from the center on an empty board', () => {
    const candidates = generateCandidatePool(createBoard(), 2, 10)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ row: 7, col: 7, features: ['positional'] })
    expect(candidates[0]!.score).toBeGreaterThan(0)
  })

  it('prioritizes an immediate white win', () => {
    const board = createBoard()
    for (let col = 3; col < 7; col += 1) board[7]![col] = 2
    const candidates = generateCandidatePool(board, 2, 10)
    expect(candidates[0]?.features).toContain('five')
  })

  it('blocks an immediate black win when white cannot win immediately', () => {
    const board = createBoard()
    for (let row = 4; row < 8; row += 1) board[row]![10] = 1
    const forced = generateCandidatePool(board, 2, 10).find(
      (candidate) => candidate.blocksImmediateWin,
    )
    expect(forced?.features).toContain('blockFive')
    expect([
      [3, 10],
      [8, 10],
    ]).toContainEqual([forced?.row, forced?.col])
  })

  it('returns only legal nearby positions sorted by score', () => {
    const board = createBoard()
    board[7]![7] = 1
    const candidates = generateCandidatePool(board, 2, 6)
    expect(candidates).toHaveLength(6)
    expect(candidates.every(({ row, col }) => board[row]?.[col] === 0)).toBe(true)
    expect(
      candidates.every(
        (candidate, index) => index === 0 || candidates[index - 1]!.score >= candidate.score,
      ),
    ).toBe(true)
  })

  it('recognizes an independent double threat across two directions', () => {
    const board = createBoard()
    board[7]![5] = 2
    board[7]![6] = 2
    board[5]![7] = 2
    board[6]![7] = 2
    const candidate = generateCandidatePool(board, 2, 20).find(
      ({ row, col }) => row === 7 && col === 7,
    )
    expect(candidate?.features).toContain('doubleThreat')
    expect(
      analyzeMovePatterns(board, 7, 7, 2).filter(({ pattern }) => pattern === 'openThree'),
    ).toHaveLength(2)
  })

  it.each([
    ['openTwo', [6], []],
    ['openThree', [5, 6], []],
    ['closedThree', [5, 6], [4]],
    ['openFour', [4, 5, 6], []],
    ['closedFour', [4, 5, 6], [3]],
    ['five', [3, 4, 5, 6], []],
  ] as const)(
    'recognizes %s without treating blocked ends as open',
    (expected, whiteCols, blackCols) => {
      const board = createBoard()
      for (const col of whiteCols) board[7]![col] = 2
      for (const col of blackCols) board[7]![col] = 1
      expect(analyzeMovePatterns(board, 7, 7, 2).map(({ pattern }) => pattern)).toContain(expected)
    },
  )

  it('does not prune protected winning moves even below the nominal pool limit', () => {
    const board = createBoard()
    for (let col = 3; col < 7; col += 1) board[7]![col] = 2
    const pool = generateCandidatePool(board, 2, 1)
    expect(pool.filter(({ features }) => features.includes('five'))).toHaveLength(2)
  })
})
