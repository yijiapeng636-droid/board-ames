export interface AgentToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AgentToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
export interface AgentToolSpec { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface AgentTransportResponse { message: { role: 'assistant'; content: string | null; tool_calls?: AgentToolCall[] }; finishReason: string | null }
export interface AgentCompletionRequest { messages: readonly AgentMessage[]; tools?: readonly AgentToolSpec[]; finalJsonOnly: boolean; signal: AbortSignal }
export interface AgentTransport { complete(request: AgentCompletionRequest): Promise<AgentTransportResponse> }
export interface AgentBudget { maxModelCalls: number; maxToolCalls: number; totalTimeoutMs: number }
export type AgentFallbackReason =
  | 'model_request_failed' | 'model_timeout' | 'agent_total_timeout' | 'round_budget_exceeded'
  | 'tool_budget_exceeded' | 'tool_timeout' | 'unknown_tool' | 'invalid_tool_args'
  | 'tool_execution_failed' | 'empty_model_response' | 'invalid_final_json' | 'invalid_final_status'
  | 'invalid_final_move' | 'move_outside_candidate_set' | 'mandatory_defense_violation'
  | 'forced_result_violation' | 'stale_session' | 'aborted' | 'fallback_requested' | 'orchestration_failed'
export type AgentFailureStage =
  | 'preflight' | 'model_request' | 'model_response' | 'tool_validation'
  | 'tool_execution' | 'final_parse' | 'final_validation' | 'tactical_gate' | 'orchestration'
export class AgentRuntimeError extends Error {
  constructor(public readonly code: AgentFallbackReason, message: string = code) { super(message); this.name = 'AgentRuntimeError' }
}
export interface AgentTrace {
  startedAt: number
  completedAt?: number
  modelCalls: Array<{ round: number; durationMs: number; finishReason?: string | null; toolCalls: string[]; hasContent: boolean }>
  toolCalls: Array<{ name: string; durationMs: number; ok: boolean; errorCode?: AgentFallbackReason }>
  totalDurationMs: number
  finalStatus: 'decision' | 'fallback' | 'aborted'
  fallbackReason?: AgentFallbackReason
  failure?: { stage: AgentFailureStage; modelCall?: number; toolName?: string; detail?: string }
  directFinal: boolean
}
export interface AgentRunResult<TResult> { value: TResult; source: 'agent' | 'fallback'; trace: AgentTrace }
