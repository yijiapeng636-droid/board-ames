import { AgentRuntimeError, type AgentFallbackReason, type AgentTransport, type AgentTransportResponse } from './agentTypes'
export class HttpAgentTransport implements AgentTransport {
  constructor(private readonly endpoint: string) {}
  async complete(request: Parameters<AgentTransport['complete']>[0]): Promise<AgentTransportResponse> {
    const response = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: request.messages, ...(request.tools ? { tools: request.tools } : {}), finalJsonOnly: request.finalJsonOnly }), signal: request.signal })
    const data = (await response.json().catch(() => null)) as (AgentTransportResponse & { error?: string; code?: AgentFallbackReason }) | null
    if (!response.ok) throw new AgentRuntimeError(data?.code ?? 'model_request_failed', data?.error ?? `Agent request failed (HTTP ${response.status})`)
    if (!data?.message || data.message.role !== 'assistant') throw new AgentRuntimeError('model_request_failed', 'Agent proxy returned an invalid response')
    if (data.message.content !== null && typeof data.message.content !== 'string') throw new AgentRuntimeError('model_request_failed', 'Agent proxy returned invalid content')
    if (data.message.tool_calls !== undefined) {
      if (!Array.isArray(data.message.tool_calls)) throw new AgentRuntimeError('model_request_failed', 'Agent proxy returned invalid tool_calls')
      for (const call of data.message.tool_calls) if (!call || call.type !== 'function' || typeof call.id !== 'string' || typeof call.function?.name !== 'string' || typeof call.function.arguments !== 'string') throw new AgentRuntimeError('model_request_failed', 'Agent proxy returned an invalid tool_call')
    }
    if (data.finishReason !== null && typeof data.finishReason !== 'string') throw new AgentRuntimeError('model_request_failed', 'Agent proxy returned an invalid finish reason')
    return data
  }
}
