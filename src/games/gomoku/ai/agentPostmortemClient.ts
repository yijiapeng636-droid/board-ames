import type {
  AgentPostmortemWorkerRequest,
  AgentPostmortemWorkerResponse,
} from '@/games/gomoku/ai/agentPostmortem.worker'
import type {
  AgentPostmortemFinding,
  AgentPostmortemInput,
} from '@/games/gomoku/ai/agentPostmortem'
import { requestWorker } from '@/workerData'

export function analyzeAgentPostmortemInWorker(
  input: AgentPostmortemInput,
): Promise<AgentPostmortemFinding[]> {
  const request: Omit<AgentPostmortemWorkerRequest, 'id'> = { input }
  return requestWorker<AgentPostmortemWorkerRequest, AgentPostmortemWorkerResponse>(
    new URL('./agentPostmortem.worker.ts', import.meta.url),
    request,
    'Agent 局后分析',
  ).then((response) => {
    if (!response.ok) throw new Error(response.error)
    return response.findings
  })
}
