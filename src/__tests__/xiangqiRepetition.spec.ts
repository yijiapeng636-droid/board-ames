import { describe, expect, it } from 'vitest'
import { createInitialXiangqiBoard } from '@/games/xiangqi/core/board'
import { adjudicateRepetition, createPositionKey } from '@/games/xiangqi/core/repetition'
import { XIANGQI_2020_COVERAGE, XIANGQI_2020_RULE_SOURCE } from '@/games/xiangqi/rules/sources'
import type {
  XiangqiMoveClassification,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

function classification(side: XiangqiSide, primaryEffect: XiangqiMoveClassification['primaryEffect']): XiangqiMoveClassification {
  return { side, effects: [primaryEffect], primaryEffect, targetPieceIds: [], ruleReference: 'fixture', evidence: ['官方棋例fixture'] }
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

  it('registers confirmed sources and complete auditable coverage metadata', () => {
    expect(XIANGQI_2020_RULE_SOURCE.confirmedByProject).toBe(true)
    expect(XIANGQI_2020_COVERAGE.length).toBeGreaterThanOrEqual(14)
    expect(XIANGQI_2020_COVERAGE.every((entry) => entry.scope === 'in-scope' && entry.ruleReference && entry.sourceFigure && entry.expectedClassification && entry.expectedVerdict && entry.testStatus === 'passed')).toBe(true)
  })
})
