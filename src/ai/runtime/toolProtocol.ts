import type { AgentToolSpec } from './agentTypes'

export interface RuntimeTool<TContext> {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(input: unknown, context: TContext, signal: AbortSignal): Promise<unknown>
}

export function toAgentToolSpecs<TContext>(tools: readonly RuntimeTool<TContext>[]): AgentToolSpec[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }))
}

export function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error('Tool arguments are not valid JSON')
  }
}

export function safeToolContent(value: unknown): string {
  const json = JSON.stringify(value)
  return json.length <= 20_000 ? json : JSON.stringify({ error: 'Tool result exceeds 20000 characters' })
}
