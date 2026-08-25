import { describe, expect, it } from 'vitest'
import type { AgentTransport } from '@/ai/runtime/agentTypes'
import { searchFixedCandidate, searchPosition } from '@/games/gomoku/ai/search'
import { buildGomokuAgentContext } from '@/games/gomoku/ai/strategy/agentConfig'
import { runGomokuStrategyAgent } from '@/games/gomoku/ai/strategy/gomokuAgent'
import { searchForcedWinFromMove } from '@/games/gomoku/ai/threatSearch'
import { createBoard } from '@/games/gomoku/core/game'
import type { Player } from '@/games/gomoku/types/gomoku'

function boardWith(pieces: Array<[number, number, Player]>) {
  const board = createBoard()
  for (const [row, col, player] of pieces) board[row]![col] = player
  return board
}

describe('Gomoku V3 round-one performance evidence', () => {
  it('records baseline, fixed deep, threat proof and scripted Agent metrics', async () => {
    const board = boardWith([[5, 5, 2], [5, 6, 2], [7, 5, 1], [7, 6, 1], [6, 7, 2], [8, 7, 1], [9, 8, 2], [6, 8, 1]])
    const baseline = searchPosition(board, { rootPlayer: 2, maxDepth: 3, maxMs: 2_000 })
    const best = baseline.candidates[0]!
    const fixed = searchFixedCandidate(board, best, 2, { maxDepth: 5, maxMs: 1_800, branchLimit: 8 })

    const transport: AgentTransport = {
      complete: async () => {
        return { message: { role: 'assistant', content: JSON.stringify({ status: 'decision', move: { row: best.row, col: best.col }, strategy: 'positional', reason: 'scripted benchmark', evidence: ['baseline_search'] }) }, finishReason: 'stop' }
      },
    }
    const agent = await runGomokuStrategyAgent(buildGomokuAgentContext(board, [], 2, 1, 2, baseline), undefined, undefined, transport)

    const threatBoard = boardWith([[7, 5, 2], [7, 6, 2], [7, 7, 2]])
    const threat = searchForcedWinFromMove(threatBoard, 2, { row: 7, col: 8 }, { maxPly: 9, maxMs: 1_000, maxNodes: 8_000 })

    console.info(`GOMOKU_ROUND1_BENCH ${JSON.stringify({ baseline: { move: [best.row, best.col], depth: baseline.metrics.searchDepth, nodes: baseline.metrics.searchedNodes, durationMs: baseline.metrics.searchDurationMs, cacheHits: baseline.metrics.cacheHits, cutoffs: baseline.metrics.cutoffCount, pv: best.principalVariation }, fixedDeep: { move: [fixed.move.row, fixed.move.col], score: fixed.searchScore, depth: fixed.completedDepth, nodes: fixed.metrics.searchedNodes, durationMs: fixed.metrics.durationMs, cacheHits: fixed.metrics.cacheHits, cutoffs: fixed.metrics.cutoffs, timedOut: fixed.timedOut, pv: fixed.principalVariation }, threat: { status: threat.status, ply: threat.plyToWin, nodes: threat.searchedNodes, durationMs: threat.durationMs, pv: threat.principalVariation }, agent: { calls: agent.trace.toolCalls.map((call) => call.name), selected: [agent.decision.row, agent.decision.col], durationMs: agent.trace.totalDurationMs, fallback: agent.source === 'fallback' } })}`)

    expect(fixed.principalVariation[0]).toMatchObject({ row: best.row, col: best.col, player: 'white' })
    expect(fixed.completedDepth).toBeGreaterThanOrEqual(baseline.metrics.searchDepth)
    expect(threat.status).toBe('proven_win')
    expect(agent.source).toBe('agent')
  })
})
