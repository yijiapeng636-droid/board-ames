import type { AgentFailureStage, AgentFallbackReason, AgentTrace } from '@/ai/runtime/agentTypes'

const stageLabels: Record<AgentFailureStage, string> = {
  preflight: '启动检查',
  model_request: 'DeepSeek 模型请求',
  model_response: 'DeepSeek 响应处理',
  tool_validation: '工具参数校验',
  tool_execution: '本地搜索工具执行',
  final_parse: '最终 JSON 解析',
  final_validation: '最终落点校验',
  tactical_gate: '本地战术门禁',
  orchestration: 'AI 回合编排',
}

const reasonLabels: Record<AgentFallbackReason, string> = {
  model_request_failed: '请求未成功，可能是接口配置、网络或服务端响应异常',
  model_timeout: '单次模型请求超过 8 秒',
  agent_total_timeout: '整个 Agent 流程超过 18 秒',
  round_budget_exceeded: '模型调用次数已用完，仍未返回最终决策',
  tool_budget_exceeded: '工具调用次数已用完',
  tool_timeout: '本地搜索工具执行超时或被中断',
  unknown_tool: '模型请求了不存在的工具',
  invalid_tool_args: '模型给出的工具参数不是合法 JSON 或不符合要求',
  tool_execution_failed: '本地搜索工具执行异常',
  empty_model_response: '模型响应中既没有最终内容，也没有工具调用',
  invalid_final_json: '最终响应不是合法 JSON',
  invalid_final_status: '最终响应的 status 不符合协议',
  invalid_final_move: '最终落点坐标无效或该位置不可落子',
  move_outside_candidate_set: '最终落点不在本回合固定候选集合内',
  mandatory_defense_violation: '最终落点没有满足必须防守要求',
  forced_result_violation: '最终落点违背本地已证明的强制结果',
  stale_session: '对局或棋盘在计算期间已经变化',
  aborted: '本次 AI 计算被重新开始、悔棋或离开页面中止',
  fallback_requested: '模型主动表示证据不足并请求本地回退',
  orchestration_failed: 'Agent 外层编排发生未预期异常',
}

const inferredStage: Partial<Record<AgentFallbackReason, AgentFailureStage>> = {
  model_request_failed: 'model_request', model_timeout: 'model_request', agent_total_timeout: 'model_request',
  round_budget_exceeded: 'model_response', empty_model_response: 'model_response',
  tool_budget_exceeded: 'tool_validation', unknown_tool: 'tool_validation', invalid_tool_args: 'tool_validation',
  tool_timeout: 'tool_execution', tool_execution_failed: 'tool_execution',
  invalid_final_json: 'final_parse', invalid_final_status: 'final_parse', fallback_requested: 'final_parse',
  invalid_final_move: 'final_validation', move_outside_candidate_set: 'final_validation',
  mandatory_defense_violation: 'tactical_gate', forced_result_violation: 'tactical_gate',
  stale_session: 'preflight', aborted: 'preflight',
  orchestration_failed: 'orchestration',
}

export interface GomokuAgentFailureDescription {
  stage: AgentFailureStage
  stageLabel: string
  message: string
  modelCall?: number
  toolName?: string
  detail?: string
}

export function describeGomokuAgentFailure(reason: AgentFallbackReason, trace?: AgentTrace, stageOverride?: AgentFailureStage, detailOverride?: string): GomokuAgentFailureDescription {
  const stage = stageOverride ?? trace?.failure?.stage ?? inferredStage[reason] ?? 'orchestration'
  const modelCall = trace?.failure?.modelCall
  const toolName = trace?.failure?.toolName
  const detail = (detailOverride ?? trace?.failure?.detail)?.slice(0, 240)
  const location = [modelCall ? `第 ${modelCall} 次模型调用` : '', toolName ? `工具 ${toolName}` : ''].filter(Boolean).join('，')
  return {
    stage,
    stageLabel: stageLabels[stage],
    message: `DeepSeek Agent 在“${stageLabels[stage]}”阶段失败${location ? `（${location}）` : ''}：${reasonLabels[reason]}${detail && detail !== reason ? `；详细信息：${detail}` : ''}。已安全改用本地搜索落子。`,
    ...(modelCall === undefined ? {} : { modelCall }),
    ...(toolName === undefined ? {} : { toolName }),
    ...(detail === undefined ? {} : { detail }),
  }
}
