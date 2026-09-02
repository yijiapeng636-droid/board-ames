import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentPostmortemInput } from '@/games/gomoku/ai/agentPostmortem'
import { analyzeAgentPostmortemInWorker } from '@/games/gomoku/ai/agentPostmortemClient'

class CloneCheckingWorker {
  private messageListener?: (event: MessageEvent) => void

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') this.messageListener = listener as (event: MessageEvent) => void
  }

  terminate() {}

  postMessage(value: unknown) {
    const request = structuredClone(value) as { id: number }
    queueMicrotask(() => this.messageListener?.({
      data: { id: request.id, ok: true, findings: [] },
    } as MessageEvent))
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Agent postmortem Worker client', () => {
  it('converts reactive nested arrays into cloneable Worker data', async () => {
    vi.stubGlobal('Worker', CloneCheckingWorker)
    const input: AgentPostmortemInput = {
      aiPlayer: 2,
      result: 'draw',
      moves: reactive([]) as AgentPostmortemInput['moves'],
      aiDecisions: reactive([]) as AgentPostmortemInput['aiDecisions'],
      aiDiagnostics: reactive([]) as AgentPostmortemInput['aiDiagnostics'],
    }

    await expect(analyzeAgentPostmortemInWorker(input)).resolves.toEqual([])
  })
})
