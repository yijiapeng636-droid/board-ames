import type {
  AgentPostmortemWorkerRequest,
  AgentPostmortemWorkerResponse,
} from '@/games/gomoku/ai/agentPostmortem.worker'
import type {
  AgentPostmortemFinding,
  AgentPostmortemInput,
} from '@/games/gomoku/ai/agentPostmortem'
import { postWorkerData } from '@/workerData'

let nextRequestId = 1

export function analyzeAgentPostmortemInWorker(
  input: AgentPostmortemInput,
): Promise<AgentPostmortemFinding[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./agentPostmortem.worker.ts', import.meta.url), {
      type: 'module',
    })
    const id = nextRequestId++

    const cleanup = () => {
      worker.terminate()
    }

    worker.addEventListener(
      'error',
      () => {
        cleanup()
        reject(new Error('Agent 局后分析 Worker 执行失败'))
      },
      { once: true },
    )

    worker.addEventListener('message', (event: MessageEvent<AgentPostmortemWorkerResponse>) => {
      if (event.data.id !== id) return
      cleanup()

      if (event.data.ok) {
        resolve(event.data.findings)
        return
      }

      reject(new Error(event.data.error))
    })

    try {
      const request: AgentPostmortemWorkerRequest = {
        id,
        input,
      }
      postWorkerData(worker, request, 'Agent 局后分析')
    } catch (error) {
      cleanup()
      reject(new Error(
        `Agent 局后分析数据无法发送到 Worker：${
          error instanceof Error ? error.message : String(error)
        }`,
      ))
    }
  })
}
