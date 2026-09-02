import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import XiangqiGame from '@/games/xiangqi/XiangqiGame.vue'
import { requestXiangqiMove } from '@/games/xiangqi/ai/deepseek'
import { XIANGQI_SESSION_EXPERIENCE_KEY, loadXiangqiSessionExperience, saveXiangqiSessionExperience } from '@/games/xiangqi/ai/sessionExperience'
import { searchXiangqi } from '@/games/xiangqi/ai/search'
import { createInitialXiangqiBoard } from '@/games/xiangqi/core/board'
import { generateLegalMoves } from '@/games/xiangqi/core/legalMoves'
import { formatXiangqiMove } from '@/games/xiangqi/core/notation'
import type { XiangqiBoard, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

class ImmediateSearchWorker {
  private messageListener?: (event: MessageEvent) => void

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') this.messageListener = listener as (event: MessageEvent) => void
  }

  terminate() {}

  postMessage(request: { id: number; board: XiangqiBoard; side: XiangqiSide }) {
    const move = generateLegalMoves(request.board, request.side)[0]!
    queueMicrotask(() => this.messageListener?.({ data: { id: request.id, ok: true, result: { candidates: [{ ...move, score: 0, depth: 1, principalVariation: [move] }], depth: 1, nodes: 1, elapsedMs: 1, aborted: false } } } as MessageEvent))
  }
}

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })

describe('xiangqi training flow', () => {
  it('starts with an accessible side dialog and lets the human play red', async () => {
    const wrapper = mount(XiangqiGame)
    await wrapper.findAll('button').find((button) => button.text() === '开始对局')!.trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('选择 AI 执棋方')
    const buttons = wrapper.findAll('[role="dialog"] button')
    await buttons[1]!.trigger('click')
    expect(wrapper.text()).toContain('玩家执红')
    await wrapper.findAll('[role="gridcell"]')[54]!.trigger('click')
    expect(wrapper.findAll('.intersection.legal').length).toBe(1)
  })

  it('formats a standard Chinese move name and isolates session storage', () => {
    const move = searchXiangqi(createInitialXiangqiBoard(), 'red', { maxDepth: 1, timeBudgetMs: 500 }).candidates.find((item) => item.piece.type === 'pawn')!
    expect(formatXiangqiMove(move)).toMatch(/^兵[一二三四五六七八九]进1$/)
    saveXiangqiSessionExperience({ games: 1, wins: 1, losses: 0, draws: 0, recurringIssues: [] })
    expect(loadXiangqiSessionExperience().wins).toBe(1)
    expect(XIANGQI_SESSION_EXPERIENCE_KEY).not.toContain('gomoku')
  })

  it('rejects a DeepSeek move outside local searched candidates', async () => {
    const candidates = searchXiangqi(createInitialXiangqiBoard(), 'red', { maxDepth: 1, timeBudgetMs: 500 }).candidates.slice(0, 2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ from: { row: 4, col: 4 }, to: { row: 4, col: 5 }, reason: 'invalid' }) }))
    await expect(requestXiangqiMove(createInitialXiangqiBoard(), [], 'red', candidates, null)).rejects.toThrow('候选列表之外')
  })

  it('replaces an English DeepSeek explanation with a Chinese local explanation', async () => {
    const candidates = searchXiangqi(createInitialXiangqiBoard(), 'red', { maxDepth: 1, timeBudgetMs: 500 }).candidates.slice(0, 2)
    const candidate = candidates[0]!
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        from: candidate.from,
        to: candidate.to,
        reason: 'Best move with highest score in searched candidates.',
      }),
    }))

    const result = await requestXiangqiMove(createInitialXiangqiBoard(), [], 'red', candidates, null)
    expect(result.reason).toMatch(/[\u3400-\u9fff]/u)
    expect(result.reason).not.toContain('Best move')
  })

  it('does not expose an undo checkpoint that restores AI red before its opening move', async () => {
    vi.stubGlobal('Worker', ImmediateSearchWorker)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ from: { row: 4, col: 4 }, to: { row: 4, col: 5 }, reason: 'invalid' }) }))
    const wrapper = mount(XiangqiGame)
    await wrapper.findAll('button').find((button) => button.text() === '开始对局')!.trigger('click')
    await wrapper.findAll('[role="dialog"] button')[0]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('黑方行棋'))
    expect(wrapper.text()).toContain('棋例分类：闲')
    expect(wrapper.text()).not.toContain('idle')
    expect(wrapper.findAll('button').find((button) => button.text() === '悔棋')!.attributes('disabled')).toBeDefined()
  })
})
