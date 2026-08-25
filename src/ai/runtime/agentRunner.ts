import type { AgentBudget, AgentFailureStage, AgentFallbackReason, AgentMessage, AgentRunResult, AgentTrace, AgentTransport } from './agentTypes'
import { AgentRuntimeError } from './agentTypes'
import { parseToolArguments, safeToolContent, toAgentToolSpecs, type RuntimeTool } from './toolProtocol'

export interface AgentRunnerOptions<TContext, TResult> {
  context: TContext; messages: AgentMessage[]; tools: readonly RuntimeTool<TContext>[]; transport: AgentTransport; budget: AgentBudget
  signal?: AbortSignal; isContextCurrent?: () => boolean
  parseFinal(content: string): TResult; validateFinal(value: TResult, context: TContext): void
  fallback(reason: AgentFallbackReason, context: TContext): TResult
}
const FINAL_ONLY_MESSAGE = 'Tool call budget is closed. Return only the final structured JSON envelope from existing facts and tool results. Do not request tools.'
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
      const finalJsonOnly = round === options.budget.maxModelCalls
      activeStage = 'model_request'; activeModelCall = round; activeToolName = undefined; activeFailureDetail = undefined
      const callStarted = Date.now()
      let response
      try {
        response = await options.transport.complete({ messages: finalJsonOnly ? [...messages, { role: 'user', content: FINAL_ONLY_MESSAGE }] : messages, ...(finalJsonOnly ? {} : { tools: specs }), finalJsonOnly, signal: controller.signal })
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
      messages.push({ role: 'assistant', content: response.message.content, ...(calls.length ? { tool_calls: calls } : {}) })
      if (calls.length) {
        activeStage = 'tool_validation'
        if (finalJsonOnly) return finishFallback('round_budget_exceeded')
        if (trace.toolCalls.length + calls.length > options.budget.maxToolCalls) return finishFallback('tool_budget_exceeded')
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
