import { describe, expect, it } from 'vitest'
import { createInitialXiangqiBoard } from '@/games/xiangqi/core/board'
import { adjudicateRepetition, createPositionKey } from '@/games/xiangqi/core/repetition'
import { classifyXiangqiMove } from '@/games/xiangqi/rules/classification'
import { XIANGQI_2020_COVERAGE, XIANGQI_2020_RULE_SOURCE } from '@/games/xiangqi/rules/sources'
import type {
  XiangqiMoveClassification,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

function classification(side: XiangqiSide, primaryEffect: XiangqiMoveClassification['primaryEffect']): XiangqiMoveClassification {
  return { side, effects: [primaryEffect], primaryEffect, targetPieceIds: [], ruleReference: 'fixture', evidence: ['官方棋例fixture'], chaseEvidence: [], forbidden: ['check', 'kill', 'capture'].includes(primaryEffect) }
}

function repeatedHistory(redEffect: XiangqiMoveClassification['primaryEffect'], blackEffect: XiangqiMoveClassification['primaryEffect']): XiangqiPositionHistoryEntry[] {
  const entries: XiangqiPositionHistoryEntry[] = []
  for (let cycle = 0; cycle < 3; cycle += 1) {
    entries.push({ key: 'position-a|turn:red', sideToMove: 'red', move: null, classification: cycle === 0 ? null : classification('black', blackEffect) })
    entries.push({ key: 'position-b|turn:black', sideToMove: 'black', move: null, classification: classification('red', redEffect) })
  }
  entries.push({ key: 'position-a|turn:red', sideToMove: 'red', move: null, classification: classification('black', blackEffect) })
  return entries
}

describe('2020 repetition evidence and adjudication', () => {
  it('includes side to move in a stable position key', () => {
    const board = createInitialXiangqiBoard()
    expect(createPositionKey(board, 'red')).not.toBe(createPositionKey(board, 'black'))
    expect(createPositionKey(board, 'red')).toBe(createPositionKey(board, 'red'))
  })

  it('requires the sole forbidden side to change and then assigns a loss if it repeats', () => {
    const history = repeatedHistory('check', 'idle')
    expect(adjudicateRepetition(history)).toMatchObject({ verdict: 'mustChange', responsibleSide: 'red' })
    expect(adjudicateRepetition(history, 'red')).toMatchObject({ verdict: 'loss', responsibleSide: 'red' })
  })

  it('draws when both sides have equal responsibility', () => {
    expect(adjudicateRepetition(repeatedHistory('capture', 'capture'))).toMatchObject({ verdict: 'draw' })
    expect(adjudicateRepetition(repeatedHistory('idle', 'idle'))).toMatchObject({ verdict: 'draw' })
  })

  it('applies 26.9.2 when direct long chase of a rook meets joint long chase of a rook', () => {
    const history = repeatedHistory('capture', 'capture')
    for (const entry of history) {
      const item = entry.classification
      if (!item) continue
      item.chaseEvidence = [{
        targetPieceId: `${item.side}-target-rook`,
        targetPieceType: 'rook',
        attackerPieceIds: item.side === 'red' ? ['red-rook'] : ['black-rook', 'black-cannon'],
        direct: true,
        joint: item.side === 'black',
        protected: false,
        netGain: 9,
        immediateMateRisk: false,
      }]
    }
    expect(adjudicateRepetition(history)).toMatchObject({ verdict: 'mustChange', responsibleSide: 'red', ruleReference: '26.9.1-26.9.3' })
  })

  it('does not turn a pre-existing attack or an already captured piece into a new chase under 24.3', () => {
    const board = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<typeof createInitialXiangqiBoard>
    board[9]![4] = { id: 'red-general', side: 'red', type: 'general' }
    board[0]![4] = { id: 'black-general', side: 'black', type: 'general' }
    board[5]![4] = { id: 'red-advisor', side: 'red', type: 'advisor' }
    board[5]![0] = { id: 'red-rook', side: 'red', type: 'rook' }
    board[5]![3] = { id: 'black-horse', side: 'black', type: 'horse' }
    board[6]![8] = { id: 'red-pawn', side: 'red', type: 'pawn' }

    const quiet = classifyXiangqiMove(board, { turn: 1, side: 'red', from: { row: 6, col: 8 }, to: { row: 5, col: 8 }, piece: board[6]![8]!, captured: null })
    expect(quiet.targetPieceIds).not.toContain('black-horse')
    expect(quiet.primaryEffect).not.toBe('capture')

    const capture = classifyXiangqiMove(board, { turn: 1, side: 'red', from: { row: 5, col: 0 }, to: { row: 5, col: 3 }, piece: board[5]![0]!, captured: board[5]![3]! })
    expect(capture.targetPieceIds).not.toContain('black-horse')
    expect(capture.primaryEffect).not.toBe('capture')
  })

  it('registers confirmed sources without claiming unexecuted fixtures have passed', () => {
    expect(XIANGQI_2020_RULE_SOURCE.confirmedByProject).toBe(true)
    expect(XIANGQI_2020_COVERAGE.length).toBeGreaterThanOrEqual(14)
    expect(XIANGQI_2020_COVERAGE.every((entry) => entry.scope === 'in-scope' && entry.ruleReference && entry.sourceFigure && entry.expectedClassification && entry.expectedVerdict)).toBe(true)
    expect(XIANGQI_2020_COVERAGE.every((entry) => entry.requiredCaseIds.length > 0)).toBe(true)
    expect(XIANGQI_2020_COVERAGE.every((entry) => !('implementationStatus' in entry) && !('testStatus' in entry))).toBe(true)
  })
})
