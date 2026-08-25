import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpAgentTransport } from '@/ai/runtime/httpTransport'

afterEach(() => vi.unstubAllGlobals())

describe('HTTP agent transport', () => {
  it('rejects malformed tool calls returned across the trust boundary', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ message: { role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'inspect_position', arguments: {} } }] }, finishReason: 'tool_calls' }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const transport = new HttpAgentTransport('/api/test')
    await expect(transport.complete({ messages: [], tools: [], finalJsonOnly: false, signal: new AbortController().signal })).rejects.toThrow('invalid tool_call')
  })

  it('forwards only messages and registered tool schemas to the fixed endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ message: { role: 'assistant', content: '{}'}, finishReason: 'stop' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = new HttpAgentTransport('/api/fixed')
    await transport.complete({ messages: [{ role: 'user', content: 'x' }], finalJsonOnly: true, signal: new AbortController().signal })
    expect(fetchMock).toHaveBeenCalledWith('/api/fixed', expect.objectContaining({ method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }], finalJsonOnly: true }) }))
  })
})
