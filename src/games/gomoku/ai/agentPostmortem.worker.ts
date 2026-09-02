/// <reference lib="webworker" />

import {
  analyzeAgentPostmortem,
  type AgentPostmortemFinding,
  type AgentPostmortemInput,
} from '@/games/gomoku/ai/agentPostmortem'

export interface AgentPostmortemWorkerRequest {
  id: number
  input: AgentPostmortemInput
}

export type AgentPostmortemWorkerResponse =
  | { id: number; ok: true; findings: AgentPostmortemFinding[] }
  | { id: number; ok: false; error: string }

self.addEventListener('message', (event: MessageEvent<AgentPostmortemWorkerRequest>) => {
  try {
    self.postMessage({
      id: event.data.id,
      ok: true,
      findings: analyzeAgentPostmortem(event.data.input),
    } satisfies AgentPostmortemWorkerResponse)
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Agent 局后分析失败',
    } satisfies AgentPostmortemWorkerResponse)
  }
})
