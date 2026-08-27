import type { AgentBudget, AgentFailureStage, AgentFallbackReason, AgentMessage, AgentRunResult, AgentTrace, AgentTransport } from './agentTypes'
import { AgentRuntimeError } from './agentTypes'
import { parseToolArguments, safeToolContent, toAgentToolSpecs, type RuntimeTool } from './toolProtocol'

export interface AgentRunnerOptions<TContext, TResult> {
  context: TContext; messages: AgentMessage[]; tools: readonly RuntimeTool<TContext>[]; transport: AgentTransport; budget: AgentBudget
  signal?: AbortSignal; isContextCurrent?: () => boolean
  parseFinal(content: string): TResult; validateFinal(value: TResult, context: TContext): void
  fallback(reason: AgentFallbackReason, context: TContext): TResult
}
const FINAL_ONLY_MESSAGE = '工具调用已经结束。只输出一个紧凑 JSON 对象，不得继续调用工具、不得复述棋盘或搜索过程。reason 不超过 60 个汉字，evidence 最多 3 项且每项不超过 40 个汉字。'
const TOOL_BUDGET_FINAL_MESSAGE = '工具额度已经用完。请立即根据已有棋盘、本地搜索和工具结果输出一个紧凑的最终 JSON 对象。不得继续请求工具、不得复述分析过程。reason 不超过 60 个汉字，evidence 最多 3 项且每项不超过 40 个汉字。'
const TRUNCATED_RECOVERY_MESSAGE = '上一次回答因过长被截断。现在只输出最终紧凑 JSON：保留 status、move.row、move.col、strategy、简短 reason 和最多 3 项 evidence；不得输出分析过程、棋盘、PV、Markdown 或工具调用。'
function reasonFrom(error: unknown, defaultReason: AgentFallbackReason): AgentFallbackReason {
  if (error instanceof AgentRuntimeError) return error.code
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'model_timeout'
  return defaultReason
}
export async function runAgent<TContext, TResult>(options: AgentRunnerOptions<TContext, TResult>): Promise<AgentRunResult<TResult>> {
  const startedAt = Date.now()
  const trace: AgentTrace = { startedAt, modelCalls: [], toolCalls: [], totalDurationMs: 0, finalStatus: 'fallback', directFinal: false }
  const controller = new AbortController()
  let totalTimedOut = false
  const externalAbort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', externalAbort, { once: true })
  const timeout = globalThis.setTimeout(() => { totalTimedOut = true; controller.abort() }, options.budget.totalTimeoutMs)
  const messages = [...options.messages]
  const specs = toAgentToolSpecs(options.tools)
  const toolMap = new Map(options.tools.map((tool) => [tool.name, tool]))
  let activeStage: AgentFailureStage = 'preflight'
  let activeModelCall: number | undefined
  let activeToolName: string | undefined
  let activeFailureDetail: string | undefined
  let finalInstruction: string | null = null
  const stale = () => !(options.isContextCurrent?.() ?? true)
  const abortReason = (): AgentFallbackReason => totalTimedOut ? 'agent_total_timeout' : options.signal?.aborted ? 'aborted' : stale() ? 'stale_session' : 'aborted'
  const finishFallback = (reason: AgentFallbackReason): AgentRunResult<TResult> => {
    trace.completedAt = Date.now(); trace.totalDurationMs = trace.completedAt - startedAt
    trace.finalStatus = reason === 'aborted' || reason === 'stale_session' ? 'aborted' : 'fallback'; trace.fallbackReason = reason
    trace.failure = { stage: activeStage, ...(activeModelCall === undefined ? {} : { modelCall: activeModelCall }), ...(activeToolName === undefined ? {} : { toolName: activeToolName }), ...(activeFailureDetail === undefined ? {} : { detail: activeFailureDetail.slice(0, 240) }) }
    return { value: options.fallback(reason, options.context), source: 'fallback', trace }
  }
  try {
    if (controller.signal.aborted || stale()) return finishFallback(abortReason())
    for (let round = 1; round <= options.budget.maxModelCalls; round += 1) {
      if (controller.signal.aborted || stale()) return finishFallback(abortReason())
      const toolBudgetExhausted = trace.toolCalls.length >= options.budget.maxToolCalls
      const finalJsonOnly = finalInstruction !== null || toolBudgetExhausted || round === options.budget.maxModelCalls
      const finalMessage = finalInstruction ?? (toolBudgetExhausted ? TOOL_BUDGET_FINAL_MESSAGE : FINAL_ONLY_MESSAGE)
      activeStage = 'model_request'; activeModelCall = round; activeToolName = undefined; activeFailureDetail = undefined
      const callStarted = Date.now()
      let response
      try {
        response = await options.transport.complete({ messages: finalJsonOnly ? [...messages, { role: 'user', content: finalMessage }] : messages, ...(finalJsonOnly ? {} : { tools: specs }), finalJsonOnly, signal: controller.signal })
      } catch (error) {
        activeFailureDetail = error instanceof Error ? error.message : undefined
        if (controller.signal.aborted || stale()) { activeFailureDetail = undefined; return finishFallback(abortReason()) }
        const reason = reasonFrom(error, 'model_request_failed')
        if (activeFailureDetail === reason) activeFailureDetail = undefined
        return finishFallback(reason)
      }
      const calls = response.message.tool_calls ?? []
      activeStage = 'model_response'
      trace.modelCalls.push({ round, durationMs: Date.now() - callStarted, finishReason: response.finishReason, toolCalls: calls.map((call) => call.function.name), hasContent: typeof response.message.content === 'string' && response.message.content.trim().length > 0 })
      if (controller.signal.aborted || stale()) return finishFallback(abortReason())
      if (calls.length) {
        if (finalJsonOnly) {
          activeStage = 'model_response'
          activeFailureDetail = `无工具最终轮仍返回 ${calls.length} 个 tool_calls`
          return finishFallback('unexpected_final_tool_call')
        }
        const remainingToolCalls = Math.max(0, options.budget.maxToolCalls - trace.toolCalls.length)
        if (calls.length > remainingToolCalls) {
          if (round < options.budget.maxModelCalls) {
            finalInstruction = TOOL_BUDGET_FINAL_MESSAGE
            continue
          }
          activeStage = 'model_response'
          activeFailureDetail = `模型请求 ${calls.length} 个工具，但仅剩 ${remainingToolCalls} 次额度`
          return finishFallback('tool_budget_exceeded')
        }
        messages.push({ role: 'assistant', content: response.message.content, tool_calls: calls })
        activeStage = 'tool_validation'
        for (const call of calls) {
          activeToolName = call.function.name
          if (controller.signal.aborted || stale()) return finishFallback(abortReason())
          const tool = toolMap.get(call.function.name)
          if (!tool) { activeFailureDetail = `Unknown tool: ${call.function.name}`; trace.toolCalls.push({ name: call.function.name, durationMs: 0, ok: false, errorCode: 'unknown_tool' }); return finishFallback('unknown_tool') }
          let input: unknown
          try { input = parseToolArguments(call.function.arguments) }
          catch (error) { activeFailureDetail = error instanceof Error ? error.message : undefined; trace.toolCalls.push({ name: tool.name, durationMs: 0, ok: false, errorCode: 'invalid_tool_args' }); return finishFallback('invalid_tool_args') }
          const toolStarted = Date.now()
          activeStage = 'tool_execution'
          try {
            const output = await tool.execute(input, options.context, controller.signal)
            trace.toolCalls.push({ name: tool.name, durationMs: Date.now() - toolStarted, ok: true })
            messages.push({ role: 'tool', tool_call_id: call.id, content: safeToolContent(output) })
          } catch (error) {
            activeFailureDetail = error instanceof Error ? error.message : undefined
            if (controller.signal.aborted || stale()) { activeFailureDetail = undefined; return finishFallback(abortReason()) }
            const reason = reasonFrom(error, error instanceof DOMException && error.name === 'AbortError' ? 'tool_timeout' : 'tool_execution_failed')
            if (activeFailureDetail === reason) activeFailureDetail = undefined
            trace.toolCalls.push({ name: tool.name, durationMs: Date.now() - toolStarted, ok: false, errorCode: reason }); return finishFallback(reason)
          }
        }
        continue
      }
      messages.push({ role: 'assistant', content: response.message.content })
      if (response.finishReason === 'length') {
        if (!finalJsonOnly && round < options.budget.maxModelCalls) {
          finalInstruction = TRUNCATED_RECOVERY_MESSAGE
          continue
        }
        activeFailureDetail = 'finish_reason=length'
        return finishFallback('model_response_truncated')
      }
      if (typeof response.message.content !== 'string' || !response.message.content.trim()) return finishFallback('empty_model_response')
      try {
        activeStage = 'final_parse'
        const value = options.parseFinal(response.message.content)
        activeStage = 'final_validation'
        options.validateFinal(value, options.context)
        trace.completedAt = Date.now(); trace.totalDurationMs = trace.completedAt - startedAt; trace.finalStatus = 'decision'; trace.directFinal = round === 1
        return { value, source: 'agent', trace }
      } catch (error) { activeFailureDetail = error instanceof Error ? error.message : undefined; const reason = reasonFrom(error, 'invalid_final_json'); if (activeFailureDetail === reason) activeFailureDetail = undefined; return finishFallback(reason) }
    }
    return finishFallback('round_budget_exceeded')
  } finally { globalThis.clearTimeout(timeout); options.signal?.removeEventListener('abort', externalAbort) }
}
