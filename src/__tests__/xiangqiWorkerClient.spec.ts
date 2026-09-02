import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeXiangqiReviewInWorker } from '@/games/xiangqi/ai/reviewClient'
import { searchXiangqiInWorker } from '@/games/xiangqi/ai/searchClient'
import { createInitialXiangqiBoard } from '@/games/xiangqi/core/board'
import { generateLegalMoves } from '@/games/xiangqi/core/legalMoves'
import type { XiangqiMove } from '@/games/xiangqi/types/xiangqi'

class CloneCheckingWorker {
  private messageListener?: (event: MessageEvent) => void

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') this.messageListener = listener as (event: MessageEvent) => void
  }

  terminate() {}

  postMessage(value: unknown) {
    const request = structuredClone(value) as { id: number; moves?: XiangqiMove[] }
    const data = request.moves
      ? { id: request.id, ok: true, points: [] }
      : { id: request.id, ok: true, result: { candidates: [], depth: 0, nodes: 0, elapsedMs: 0, aborted: false } }
    queueMicrotask(() => this.messageListener?.({ data } as MessageEvent))
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('xiangqi worker clients', () => {
  it('converts a reactive board and search history into cloneable worker data', async () => {
    vi.stubGlobal('Worker', CloneCheckingWorker)
    const board = reactive(createInitialXiangqiBoard())
    const options = reactive({
      maxDepth: 1,
      timeBudgetMs: 100,
      positionHistory: [{
        key: 'position',
        sideToMove: 'red' as const,
        move: null,
        classification: {
          side: 'red' as const,
          effects: ['capture' as const],
          primaryEffect: 'capture' as const,
          targetPieceIds: ['black-rook-1'],
          ruleReference: '24.3',
          evidence: ['new attack'],
          chaseEvidence: [{
            targetPieceId: 'black-rook-1',
            targetPieceType: 'rook' as const,
            attackerPieceIds: ['red-cannon-1'],
            direct: true,
            joint: false,
            protected: false,
            netGain: 1,
            immediateMateRisk: false,
          }],
          forbidden: true,
        },
      }],
    })

    await expect(searchXiangqiInWorker(board, 'red', options)).resolves.toMatchObject({ aborted: false })
  })

  it('converts reactive review moves into cloneable worker data', async () => {
    vi.stubGlobal('Worker', CloneCheckingWorker)
    const board = reactive(createInitialXiangqiBoard())
    const candidate = generateLegalMoves(board, 'red')[0]!
    const moves = reactive<XiangqiMove[]>([{ ...candidate, turn: 1 }])

    await expect(analyzeXiangqiReviewInWorker(board, moves, 'red')).resolves.toEqual([])
  })
})
