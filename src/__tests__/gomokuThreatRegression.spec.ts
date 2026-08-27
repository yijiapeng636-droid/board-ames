import { describe, expect, it } from 'vitest'
import { evaluateCandidate } from '@/games/gomoku/ai/candidates'
import { searchPosition } from '@/games/gomoku/ai/search'
import { buildGomokuAgentContext } from '@/games/gomoku/ai/strategy/agentConfig'
import { validateGomokuTacticalGate } from '@/games/gomoku/ai/strategy/tacticalGate'
import { analyzeThreat } from '@/games/gomoku/ai/threatAnalysis'
import { searchForcedWinFromMove } from '@/games/gomoku/ai/threatSearch'
import {
  createScreenshotDoubleThreatBoard,
  SCREENSHOT_DOUBLE_THREAT_MOVE,
  SCREENSHOT_DOUBLE_THREAT_PLAYER,
} from '@/__tests__/fixtures/gomokuScreenshotDoubleThreat'

describe('screenshot double-threat regression', () => {
  it('keeps the full Board -> Candidate -> Threat Analysis -> Threat Search -> Gate chain consistent', () => {
    const board = createScreenshotDoubleThreatBoard()
    const move = SCREENSHOT_DOUBLE_THREAT_MOVE

    const candidate = evaluateCandidate(board, move.row, move.col, SCREENSHOT_DOUBLE_THREAT_PLAYER)
    expect(candidate.createsDoubleThreat).toBe(true)

    const analysis = analyzeThreat(board, move, SCREENSHOT_DOUBLE_THREAT_PLAYER)
    expect(analysis.openThrees.map((line) => line.direction).sort()).toEqual([
      'diagonalDown',
      'horizontal',
    ])
    expect(analysis.doubleThreat).toBe(true)
    expect(analysis.defenseSquares).toHaveLength(4)

    const proof = searchForcedWinFromMove(board, SCREENSHOT_DOUBLE_THREAT_PLAYER, move, {
      maxPly: 9,
      maxMs: 2_000,
      maxNodes: 20_000,
    })
    expect(proof.status).toBe('proven_win')
    expect(proof.winningMove).toEqual(move)

    const baseline = searchPosition(board, {
      rootPlayer: SCREENSHOT_DOUBLE_THREAT_PLAYER,
      maxMs: 2_000,
      threatMaxPly: 9,
    })
    expect(baseline.forcedMoveType).toBe('forcedTactical')
    expect(baseline.candidates[0]).toMatchObject(move)

    const context = buildGomokuAgentContext(board, [], 2, 1, 2, baseline)
    const alternative = context.allowedCandidates.find((item) =>
      item.row !== move.row || item.col !== move.col,
    )
    expect(alternative).toBeDefined()
    expect(validateGomokuTacticalGate(
      { ...alternative!, strategy: 'positional', reason: '', evidence: [] },
      context,
    )).toBe('forced_result_violation')
  })
})
