import { describe, expect, it } from 'vitest'
import { analyzeAgentPostmortem } from '@/games/gomoku/ai/agentPostmortem'
import type { AIDecisionRecord, GameHistoryMove } from '@/games/gomoku/ai/sessionExperience'
import type { GameResult, GomokuAIDiagnostic, Player } from '@/games/gomoku/types/gomoku'

function move(
  turn: number,
  player: Player,
  row: number,
  col: number,
  revertedAt?: number,
): GameHistoryMove {
  return {
    id: `move-${turn}`,
    turn,
    player,
    row,
    col,
    phase: player === 2 ? 'aiThinking' : 'playerTurn',
    ...(revertedAt === undefined ? {} : { revertedAt }),
  }
}

function decision(
  turn: number,
  selectedMove: { row: number; col: number },
  input: Partial<AIDecisionRecord> = {},
): AIDecisionRecord {
  return {
    id: `decision-${turn}`,
    moveId: `move-${turn}`,
    moveNumber: turn,
    positionKey: `position-${turn}`,
    selectedMove,
    source: 'deepseek',
    ...input,
  }
}

function diagnostic(turn: number, input: Partial<GomokuAIDiagnostic> = {}): GomokuAIDiagnostic {
  return {
    moveNumber: turn,
    aiPlayer: 2,
    sideToMove: 2,
    strategyCandidateCount: 5,
    baselineCompletedDepth: 2,
    forcedMoveType: null,
    threatSearchStatus: 'not_proven',
    agentUsed: true,
    agentToolCalls: [],
    agentModelCalls: 1,
    agentTotalDurationMs: 10,
    agentDirectFinal: true,
    finalMove: { row: 0, col: 0 },
    finalSource: 'deepseek',
    ...input,
  }
}

function analyze(
  moves: GameHistoryMove[],
  aiDecisions: AIDecisionRecord[],
  aiDiagnostics: GomokuAIDiagnostic[] = [],
  result: Exclude<GameResult, null> = 'blackWin',
) {
  return analyzeAgentPostmortem({
    aiPlayer: 2,
    result,
    moves,
    aiDecisions,
    aiDiagnostics,
  })
}

describe('Gomoku Agent postmortem', () => {
  it('detects an immediate winning move that the AI missed', () => {
    const moves = [
      move(1, 1, 0, 0),
      move(2, 2, 7, 5),
      move(3, 1, 0, 2),
      move(4, 2, 7, 6),
      move(5, 1, 0, 4),
      move(6, 2, 7, 7),
      move(7, 1, 1, 0),
      move(8, 2, 7, 8),
      move(9, 1, 1, 2),
      move(10, 2, 10, 10),
    ]

    const findings = analyze(
      moves,
      [
        decision(
          10,
          { row: 10, col: 10 },
          {
            localBestMove: { row: 7, col: 4 },
            localBestScore: 100_000_000,
            searchScore: 0,
          },
        ),
      ],
      [diagnostic(10)],
    )

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missed_forced_win',
          severity: 'critical',
          moveNumber: 10,
          selectedMove: { row: 10, col: 10 },
        }),
      ]),
    )
  })

  it('detects an ignored next-turn fork as missed critical defense', () => {
    const moves = [
      move(1, 1, 7, 6),
      move(2, 2, 0, 0),
      move(3, 1, 7, 7),
      move(4, 2, 0, 2),
      move(5, 1, 7, 8),
      move(6, 2, 10, 10),
    ]

    const findings = analyze(
      moves,
      [
        decision(
          6,
          { row: 10, col: 10 },
          {
            localBestMove: { row: 7, col: 5 },
            localBestScore: 20_000,
            searchScore: 0,
          },
        ),
      ],
      [diagnostic(6)],
    )

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missed_critical_defense',
          severity: 'critical',
          moveNumber: 6,
        }),
      ]),
    )
  })

  it('detects a materially worse DeepSeek override', () => {
    const moves = [move(1, 1, 7, 7), move(2, 2, 7, 8), move(3, 1, 6, 7), move(4, 2, 10, 10)]

    const findings = analyze(
      moves,
      [
        decision(
          4,
          { row: 10, col: 10 },
          {
            localBestMove: { row: 8, col: 8 },
            localBestScore: 20_000,
            searchScore: 1_000,
          },
        ),
      ],
      [diagnostic(4)],
    )

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsafe_agent_override',
          moveNumber: 4,
          recommendedMove: { row: 8, col: 8 },
        }),
      ]),
    )
  })

  it('ignores AI decisions linked to reverted moves', () => {
    const moves = [
      move(1, 1, 0, 0),
      move(2, 2, 7, 5),
      move(3, 1, 0, 2),
      move(4, 2, 7, 6),
      move(5, 1, 0, 4),
      move(6, 2, 7, 7),
      move(7, 1, 1, 0),
      move(8, 2, 7, 8),
      move(9, 1, 1, 2),
      move(10, 2, 10, 10, 100),
    ]

    const findings = analyze(
      moves,
      [
        decision(
          10,
          { row: 10, col: 10 },
          {
            localBestMove: { row: 7, col: 4 },
            localBestScore: 100_000_000,
            searchScore: 0,
          },
        ),
      ],
      [diagnostic(10)],
    )

    expect(findings).toEqual([])
  })
})
