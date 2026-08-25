import { runAgent } from '@/ai/runtime/agentRunner'
import { AgentRuntimeError, type AgentFallbackReason, type AgentTrace, type AgentTransport } from '@/ai/runtime/agentTypes'
import runtimeSkill from '@/ai/runtime/SKILL.md?raw'
import gomokuSkill from './SKILL.md?raw'
import { GOMOKU_AGENT_BUDGET, gomokuStrategyTools } from './agentConfig'
import { gomokuAgentTransport } from './agentTransport'
import type { GomokuAgentContext, GomokuStrategyDecision } from './strategyTypes'

export interface GomokuAgentDecisionResult { decision: GomokuStrategyDecision; source: 'agent' | 'fallback'; trace: AgentTrace }
const strategies = ['forced_attack', 'mandatory_defense', 'initiative', 'positional'] as const
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const hasChinese = (value: string) => /[\u3400-\u9fff]/u.test(value)
const chineseEvidence = (value: string) => {
  if (hasChinese(value)) return value
  if (value === 'baseline_search') return '本地基准搜索结果'
  if (value === 'position_inspection') return '本地局面检查结果'
  return 'AI 策略分析结果'
}

export function parseGomokuDecision(content: string): GomokuStrategyDecision {
  let value: unknown
  try { value = JSON.parse(content) }
  catch { throw new AgentRuntimeError('invalid_final_json') }
  if (!isRecord(value) || typeof value.status !== 'string') throw new AgentRuntimeError('invalid_final_status')
  if (value.status === 'fallback_required') throw new AgentRuntimeError('fallback_requested')
  if (value.status !== 'decision') throw new AgentRuntimeError('invalid_final_status')
  if (!isRecord(value.move) || !Number.isInteger(value.move.row) || !Number.isInteger(value.move.col)) throw new AgentRuntimeError('invalid_final_move')
  const row = value.move.row as number; const col = value.move.col as number
  if (row < 0 || row >= 15 || col < 0 || col >= 15) throw new AgentRuntimeError('invalid_final_move')
  const strategy = typeof value.strategy === 'string' && strategies.includes(value.strategy as typeof strategies[number]) ? value.strategy as typeof strategies[number] : 'positional'
  const reason = typeof value.reason === 'string' ? value.reason : ''
  const evidence = Array.isArray(value.evidence) && value.evidence.every((item) => typeof item === 'string') ? [...new Set(value.evidence.map(chineseEvidence))] : []
  return { row, col, strategy, reason: reason && !hasChinese(reason) ? 'AI 根据本地局面分析选择了这个落点。' : reason, evidence }
}
function validateDecision(decision: GomokuStrategyDecision, context: GomokuAgentContext) {
  if (context.board[decision.row]?.[decision.col] !== 0) throw new AgentRuntimeError('invalid_final_move')
  if (!context.allowedCandidates.some((candidate) => candidate.row === decision.row && candidate.col === decision.col)) throw new AgentRuntimeError('move_outside_candidate_set')
}
export function createGomokuFallback(context: GomokuAgentContext, reason: AgentFallbackReason): GomokuStrategyDecision {
  const best = context.baselineSearch.candidates[0]
  if (!best) throw new Error('No local fallback candidate is available')
  return { row: best.row, col: best.col, strategy: 'positional', reason: 'AI 已改用本地搜索结果完成落子。', evidence: [`本地基准搜索回退：${reason}`] }
}
function buildPositionMessage(context: GomokuAgentContext) {
  return JSON.stringify({ positionKey: context.positionKey, aiPlayer: context.aiPlayer === 1 ? 'black' : 'white', sideToMove: context.sideToMove === 1 ? 'black' : 'white',
    board: context.board.map((line) => line.map((piece) => piece === 1 ? 'X' : piece === 2 ? 'O' : '.').join('')),
    positionInspection: context.positionInspection, allowedCandidates: context.allowedCandidates,
    baselineSearch: { candidates: context.baselineSearch.candidates, forcedMoveType: context.baselineSearch.forcedMoveType, metrics: context.baselineSearch.metrics },
    sessionExperience: context.sessionExperience ?? null })
}
export async function runGomokuStrategyAgent(context: GomokuAgentContext, signal?: AbortSignal, isContextCurrent?: () => boolean, transport: AgentTransport = gomokuAgentTransport): Promise<GomokuAgentDecisionResult> {
  const result = await runAgent({
    context,
    messages: [
      { role: 'system', content: `你是五子棋决策 Agent。思考模式已关闭，本地事实、搜索工具和战术门禁具有最高权威。所有面向玩家的 reason 和 evidence 内容必须使用简体中文；JSON 字段名及 strategy 枚举保持协议规定的英文。\n\n${runtimeSkill}\n\n${gomokuSkill}` },
      { role: 'user', content: `从允许候选中选择一个落点。只在存在尚未解决的问题时调用工具。最终只返回协议规定的 Decision 或 Fallback JSON，并确保 reason、evidence 使用简体中文。\n${buildPositionMessage(context)}` },
    ],
    tools: gomokuStrategyTools, transport, budget: GOMOKU_AGENT_BUDGET, signal, isContextCurrent,
    parseFinal: parseGomokuDecision, validateFinal: validateDecision,
    fallback: (reason, currentContext) => createGomokuFallback(currentContext, reason),
  })
  if (import.meta.env.DEV && result.source === 'fallback') console.warn('[GomokuAgent fallback]', result.trace)
  return { decision: result.value, source: result.source, trace: result.trace }
}
