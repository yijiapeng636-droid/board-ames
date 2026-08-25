import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from '@/ai/runtime/agentRunner'
import { AgentRuntimeError, type AgentTransport, type AgentTransportResponse } from '@/ai/runtime/agentTypes'

const response = (content: string): AgentTransportResponse => ({ message: { role: 'assistant', content }, finishReason: 'stop' })
const call = (name: string, args: unknown = {}): AgentTransportResponse => ({ message: { role: 'assistant', content: null, tool_calls: [{ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finishReason: 'tool_calls' })
function transport(...responses: AgentTransportResponse[]): AgentTransport { return { complete: vi.fn<AgentTransport['complete']>(async () => responses.shift()!) } }
const tool = (name: string) => ({ name, description: name, inputSchema: { type: 'object' }, execute: vi.fn<(input: unknown, context: unknown, signal: AbortSignal) => Promise<{ status: string }>>(async () => ({ status: 'ok' })) })
const compare = tool('compare_candidates'); const deep = tool('search_candidate')
const budget = { maxModelCalls: 4, maxToolCalls: 4, totalTimeoutMs: 1_000 }
function options(agentTransport: AgentTransport) {
  return { context: { allowed: 7 }, messages: [{ role: 'user' as const, content: 'choose' }], tools: [compare, deep], transport: agentTransport, budget,
    parseFinal: (content: string) => { try { return JSON.parse(content) as { value: number } } catch { throw new AgentRuntimeError('invalid_final_json') } },
    validateFinal: (value: { value: number }) => { if (value.value !== 7) throw new AgentRuntimeError('invalid_final_move') },
    fallback: () => ({ value: 7 }) }
}
beforeEach(() => vi.clearAllMocks())

describe('generic agent runtime', () => {
  it('supports direct final', async () => {
    const result = await runAgent(options(transport(response('{"value":7}'))))
    expect(result.source).toBe('agent'); expect(result.trace.modelCalls).toHaveLength(1); expect(result.trace.toolCalls).toHaveLength(0); expect(result.trace.directFinal).toBe(true)
  })
  it('supports compare -> final and compare -> deep -> final', async () => {
    const short = await runAgent(options(transport(call('compare_candidates'), response('{"value":7}'))))
    expect(short.source).toBe('agent'); expect(short.trace.modelCalls).toHaveLength(2)
    const full = await runAgent(options(transport(call('compare_candidates'), call('search_candidate'), response('{"value":7}'))))
    expect(full.source).toBe('agent'); expect(full.trace.modelCalls).toHaveLength(3); expect(full.trace.toolCalls.map((item) => item.name)).toEqual(['compare_candidates', 'search_candidate'])
  })
  it('reserves the last model call without tools', async () => {
    const mock = transport(call('compare_candidates'), call('search_candidate'), call('compare_candidates'), response('{"value":7}'))
    const result = await runAgent(options(mock)); expect(result.source).toBe('agent')
    const requests = vi.mocked(mock.complete).mock.calls.map(([request]) => request)
    expect(requests[3]).toMatchObject({ finalJsonOnly: true }); expect(requests[3]!.tools).toBeUndefined()
  })
  it('does not retry invalid JSON on the reserved final call', async () => {
    const mock = transport(call('compare_candidates'), call('search_candidate'), call('compare_candidates'), response('not-json'))
    const result = await runAgent(options(mock)); expect(result.trace.fallbackReason).toBe('invalid_final_json'); expect(mock.complete).toHaveBeenCalledTimes(4)
  })
  it('classifies round and tool budgets', async () => {
    const round = await runAgent({ ...options(transport(call('compare_candidates'))), budget: { ...budget, maxModelCalls: 1 } })
    expect(round.trace.fallbackReason).toBe('round_budget_exceeded')
    const tools = await runAgent({ ...options(transport(call('compare_candidates'))), budget: { ...budget, maxToolCalls: 0 } })
    expect(tools.trace.fallbackReason).toBe('tool_budget_exceeded')
  })
  it('distinguishes total, model and tool timeouts', async () => {
    const pending: AgentTransport = { complete: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) }
    const total = await runAgent({ ...options(pending), budget: { ...budget, totalTimeoutMs: 5 } }); expect(total.trace.fallbackReason).toBe('agent_total_timeout')
    const model: AgentTransport = { complete: async () => { throw new AgentRuntimeError('model_timeout') } }
    const modelResult = await runAgent(options(model))
    expect(modelResult.trace.fallbackReason).toBe('model_timeout')
    expect(modelResult.trace.failure).toEqual({ stage: 'model_request', modelCall: 1 })
    const brokenTool = { ...deep, execute: async () => { throw new AgentRuntimeError('tool_timeout') } }
    const toolResult = await runAgent({ ...options(transport(call('search_candidate'))), tools: [brokenTool] })
    expect(toolResult.trace.fallbackReason).toBe('tool_timeout')
    expect(toolResult.trace.failure).toEqual({ stage: 'tool_execution', modelCall: 1, toolName: 'search_candidate' })
  })
  it('distinguishes stale sessions and manual aborts', async () => {
    let current = true
    const staleTransport: AgentTransport = { complete: async () => { current = false; return response('{"value":7}') } }
    expect((await runAgent({ ...options(staleTransport), isContextCurrent: () => current })).trace.fallbackReason).toBe('stale_session')
    const controller = new AbortController(); controller.abort()
    expect((await runAgent({ ...options(transport(response('{"value":7}'))), signal: controller.signal })).trace.fallbackReason).toBe('aborted')
  })
})
