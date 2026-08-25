import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import XiangqiGame from '@/games/xiangqi/XiangqiGame.vue'
import { requestXiangqiMove } from '@/games/xiangqi/ai/deepseek'
import { XIANGQI_SESSION_EXPERIENCE_KEY, loadXiangqiSessionExperience, saveXiangqiSessionExperience } from '@/games/xiangqi/ai/sessionExperience'
import { searchXiangqi } from '@/games/xiangqi/ai/search'
import { createInitialXiangqiBoard } from '@/games/xiangqi/core/board'
import { formatXiangqiMove } from '@/games/xiangqi/core/notation'

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
})
