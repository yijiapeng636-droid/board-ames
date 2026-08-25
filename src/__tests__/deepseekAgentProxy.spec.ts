import { describe, expect, it } from 'vitest'
import { parseAgentPayload } from '../../server/deepseekProxy'

describe('DeepSeek agent proxy protocol', () => {
  it('keeps assistant tool_calls and matching tool messages for stateless replay', () => {
    const result = parseAgentPayload({
      messages: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'inspect_position', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
      ],
      tools: [{ type: 'function', function: { name: 'inspect_position', description: 'inspect', parameters: { type: 'object' } } }],
    })
    expect(result.messages[0]).toMatchObject({ role: 'assistant', content: null, tool_calls: [{ id: 'call-1' }] })
    expect(result.messages[1]).toMatchObject({ role: 'tool', tool_call_id: 'call-1' })
  })

  it('rejects malformed roles and tool-call arguments before forwarding', () => {
    expect(() => parseAgentPayload({ messages: [{ role: 'admin', content: 'x' }], tools: [] })).toThrow('role')
    expect(() => parseAgentPayload({ messages: [{ role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'x', arguments: {} } }] }], tools: [] })).toThrow('tool_call')
  })

  it('accepts a final JSON-only round without tools', () => {
    expect(parseAgentPayload({ messages: [{ role: 'user', content: 'final' }], finalJsonOnly: true })).toEqual({ messages: [{ role: 'user', content: 'final' }], finalJsonOnly: true })
  })
})
