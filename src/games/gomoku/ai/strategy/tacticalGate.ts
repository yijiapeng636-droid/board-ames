import type { AgentFallbackReason } from '@/ai/runtime/agentTypes'
import { analyzeThreat } from '@/games/gomoku/ai/threatAnalysis'
import type { GomokuAgentContext, GomokuStrategyDecision, StrategyPosition } from './strategyTypes'
const same = (left: StrategyPosition, right: StrategyPosition) => left.row === right.row && left.col === right.col
export function validateGomokuTacticalGate(decision: GomokuStrategyDecision, context: GomokuAgentContext): AgentFallbackReason | null {
  if (context.sideToMove !== context.aiPlayer) return 'stale_session'
  if (!context.allowedCandidates.some((move) => same(move, decision))) return 'move_outside_candidate_set'
  const decisionThreat = analyzeThreat(context.board, decision, context.aiPlayer)
  if (context.positionInspection.immediateWins.length > 0 && !decisionThreat.winNow) return 'forced_result_violation'
  if (context.positionInspection.mandatoryDefense.required && !context.positionInspection.mandatoryDefense.moves.some((move) => same(move, decision))) return 'mandatory_defense_violation'
  if (context.baselineSearch.forcedMoveType && context.baselineSearch.candidates[0] && !same(context.baselineSearch.candidates[0], decision)) return 'forced_result_violation'
  return null
}
