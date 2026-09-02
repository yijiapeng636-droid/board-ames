import type { AgentFallbackReason } from '@/ai/runtime/agentTypes'
import { SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import { analyzeThreat } from '@/games/gomoku/ai/threatAnalysis'
import { inspectGomokuPosition } from './positionInspection'
import type { GomokuAgentContext, GomokuStrategyDecision, StrategyPosition } from './strategyTypes'
const same = (left: StrategyPosition, right: StrategyPosition) => left.row === right.row && left.col === right.col

export function validateGomokuTacticalGate(decision: GomokuStrategyDecision, context: GomokuAgentContext): AgentFallbackReason | null {
  if (context.sideToMove !== context.aiPlayer) return 'stale_session'
  if (!context.allowedCandidates.some((move) => same(move, decision))) return 'move_outside_candidate_set'
  const decisionThreat = analyzeThreat(context.board, decision, context.aiPlayer)
  if (context.positionInspection.immediateWins.length > 0) {
    return decisionThreat.winNow ? null : 'forced_result_violation'
  }
  if (context.baselineSearch.forcedMoveType && context.baselineSearch.candidates[0]) {
    return same(context.baselineSearch.candidates[0], decision) ? null : 'forced_result_violation'
  }
  if (context.positionInspection.mandatoryDefense.required && !context.positionInspection.mandatoryDefense.moves.some((move) => same(move, decision))) return 'mandatory_defense_violation'
  return null
}

export async function verifyGomokuAgentDecisionSafety(
  decision: GomokuStrategyDecision,
  context: GomokuAgentContext,
  signal: AbortSignal,
): Promise<AgentFallbackReason | null> {
  const baselineBest = context.baselineSearch.candidates[0]
  const decisionThreat = analyzeThreat(context.board, decision, context.aiPlayer)
  if (decisionThreat.winNow) return null
  if (context.baselineSearch.forcedMoveType && baselineBest && same(baselineBest, decision)) return null

  const after = context.board.map((line) => [...line])
  after[decision.row]![decision.col] = context.aiPlayer
  const afterMoveViolation = inspectGomokuPosition(after, context.aiPlayer).mandatoryDefense.required
    ? 'mandatory_defense_violation' as const
    : null
  if (!baselineBest || same(baselineBest, decision)) return afterMoveViolation

  const fixed = await context.runFixedSearch(
    context.board,
    decision,
    context.aiPlayer,
    {
      maxDepth: Math.max(1, context.baselineSearch.metrics.searchDepth),
      maxMs: 600,
    },
    signal,
  )
  if (fixed.timedOut) return 'forced_result_violation'
  if (fixed.forcedWin) return null
  if (afterMoveViolation) return afterMoveViolation
  return fixed.searchScore < baselineBest.searchScore - SEARCH_CONFIG.agentAcceptableScoreMargin
    ? 'forced_result_violation'
    : null
}
