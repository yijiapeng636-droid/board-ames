import { describe, expect, it } from 'vitest'
import { searchXiangqi } from '@/games/xiangqi/ai/search'
import { createInitialXiangqiBoard, serializeXiangqiBoard } from '@/games/xiangqi/core/board'
import { applyXiangqiMove, generateLegalMoves } from '@/games/xiangqi/core/legalMoves'
import { createPositionKey } from '@/games/xiangqi/core/repetition'
import type { XiangqiMoveClassification, XiangqiPositionHistoryEntry } from '@/games/xiangqi/types/xiangqi'

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

  it('scores a one-ply terminal win before applying the depth cutoff', () => {
    const board = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<typeof createInitialXiangqiBoard>
    board[9]![4] = { id: 'red-general', side: 'red', type: 'general' }
    board[0]![4] = { id: 'black-general', side: 'black', type: 'general' }
    board[1]![4] = { id: 'red-rook', side: 'red', type: 'rook' }
    const result = searchXiangqi(board, 'red', { maxDepth: 1, timeBudgetMs: 1_000 })
    const winning = result.candidates.find((candidate) => candidate.to.row === 0 && candidate.to.col === 4)
    expect(winning?.score).toBeGreaterThan(900_000)
  })

  it('uses the adjudicator instead of treating every third repetition as a draw', () => {
    const board = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<typeof createInitialXiangqiBoard>
    board[9]![4] = { id: 'red-general', side: 'red', type: 'general' }
    board[0]![4] = { id: 'black-general', side: 'black', type: 'general' }
    board[2]![3] = { id: 'red-rook', side: 'red', type: 'rook' }
    const checkingMove = generateLegalMoves(board, 'red').find((move) => move.to.row === 2 && move.to.col === 4)!
    const repeatedBoard = applyXiangqiMove(board, checkingMove)
    const repeatedKey = createPositionKey(repeatedBoard, 'black')
    const rootKey = createPositionKey(board, 'red')
    const redCheck: XiangqiMoveClassification = { side: 'red', effects: ['check'], primaryEffect: 'check', targetPieceIds: [], ruleReference: '24.1,25.1', evidence: ['fixture'], chaseEvidence: [], forbidden: true }
    const blackIdle: XiangqiMoveClassification = { side: 'black', effects: ['idle'], primaryEffect: 'idle', targetPieceIds: [], ruleReference: '24.8', evidence: ['fixture'], chaseEvidence: [], forbidden: false }
    const history: XiangqiPositionHistoryEntry[] = [
      { key: repeatedKey, sideToMove: 'black', move: null, classification: null },
      { key: rootKey, sideToMove: 'red', move: null, classification: blackIdle },
      { key: repeatedKey, sideToMove: 'black', move: null, classification: redCheck },
      { key: rootKey, sideToMove: 'red', move: null, classification: blackIdle },
    ]
    const result = searchXiangqi(board, 'red', { maxDepth: 1, timeBudgetMs: 2_000, positionHistory: history, mustChangeSide: 'red' })
    const repeated = result.candidates.find((candidate) => candidate.to.row === 2 && candidate.to.col === 4)
    expect(repeated?.score).toBeLessThan(-900_000)
    expect(history).toHaveLength(4)
  })
})
