import { describe, expect, it } from 'vitest'
import { searchXiangqi } from '@/games/xiangqi/ai/search'
import { createInitialXiangqiBoard, serializeXiangqiBoard } from '@/games/xiangqi/core/board'
import { generateLegalMoves } from '@/games/xiangqi/core/legalMoves'

describe('xiangqi local search', () => {
  it('returns scored legal candidates without mutating the position', () => {
    const board = createInitialXiangqiBoard()
    const before = serializeXiangqiBoard(board)
    const legal = generateLegalMoves(board, 'red')
    const result = searchXiangqi(board, 'red', { maxDepth: 2, timeBudgetMs: 2_000 })
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.depth).toBe(2)
    expect(result.nodes).toBeGreaterThan(0)
    expect(result.candidates.every((candidate) => legal.some((move) => move.from.row === candidate.from.row && move.from.col === candidate.from.col && move.to.row === candidate.to.row && move.to.col === candidate.to.col))).toBe(true)
    expect(serializeXiangqiBoard(board)).toBe(before)
  })

  it('honors abort checks and returns the last completed depth', () => {
    const board = createInitialXiangqiBoard()
    let checks = 0
    const result = searchXiangqi(board, 'red', { maxDepth: 5, timeBudgetMs: 10_000, shouldAbort: () => ++checks > 5 })
    expect(result.aborted).toBe(true)
    expect(result.depth).toBeLessThan(5)
  })
})
