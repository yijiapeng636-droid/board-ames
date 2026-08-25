import { beforeEach, describe, expect, it, vi } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import App from '@/games/gomoku/GomokuGame.vue'
import { searchAIMoves } from '@/games/gomoku/ai/searchClient'
import { runGomokuStrategyAgent } from '@/games/gomoku/ai/strategy/gomokuAgent'
import type { SearchResult } from '@/games/gomoku/types/gomoku'

vi.mock('@/games/gomoku/ai/searchClient', () => ({ searchAIMoves: vi.fn<typeof searchAIMoves>() }))
vi.mock('@/games/gomoku/ai/strategy/gomokuAgent', () => ({ runGomokuStrategyAgent: vi.fn<typeof runGomokuStrategyAgent>() }))

const mockedAgent = vi.mocked(runGomokuStrategyAgent)
const mockedSearch = vi.mocked(searchAIMoves)

function agentResult(row: number, col: number, reason = 'agent choice') {
  return { decision: { row, col, strategy: 'positional' as const, reason, evidence: ['test'] }, source: 'agent' as const, trace: { startedAt: 0, completedAt: 1, modelCalls: [{ round: 1, durationMs: 1, finishReason: 'stop', toolCalls: [], hasContent: true }], toolCalls: [], totalDurationMs: 1, finalStatus: 'decision' as const, directFinal: true } }
}

async function startWithAIWhite(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.start-on-board').trigger('click')
  await wrapper.findAll('.setup-actions button')[1]!.trigger('click')
}
const searchResult: SearchResult = {
  candidates: [
    {
      row: 7,
      col: 8,
      staticScore: 100,
      searchScore: 200,
      features: ['positional'],
      principalVariation: [{ player: 'white', row: 7, col: 8 }],
    },
    {
      row: 6,
      col: 8,
      staticScore: 500,
      searchScore: 180,
      features: ['positional'],
      principalVariation: [{ player: 'white', row: 6, col: 8 }],
    },
  ],
  forcedMoveType: null,
  metrics: {
    candidateCount: 20,
    searchedNodes: 100,
    searchDepth: 3,
    searchDurationMs: 20,
    cutoffCount: 10,
    cacheHits: 2,
    ttStores: 4,
    extensionNodes: 0,
    timedOut: false,
  },
  trace: {
    aiPlayer: 2,
    sideToMove: 2,
    generatedCandidateCount: 20,
    candidates: [],
    forcedMoveType: null,
    search: {
      completedDepth: 3,
      searchedNodes: 100,
      cutoffCount: 10,
      cacheHits: 2,
      durationMs: 20,
      timedOut: false,
    },
    principalVariation: [{ player: 'white', row: 7, col: 8 }],
    finalSource: 'search',
  },
}

beforeEach(() => {
  mockedAgent.mockReset()
  mockedSearch.mockReset()
  mockedSearch.mockResolvedValue(searchResult)
})

describe('App', () => {
  it('runs player -> AI -> player flow', async () => {
    let resolveMove: ((move: { row: number; col: number; reason: string }) => void) | undefined
    mockedAgent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMove = (move) => resolve(agentResult(move.row, move.col, move.reason))
        }),
    )
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    const cells = wrapper.findAll('[role="gridcell"]')
    await cells[7 * 15 + 7]!.trigger('click')
    expect(wrapper.text()).toContain('AI 正在思考')
    resolveMove?.({ row: 7, col: 8, reason: '靠近中心' })
    await flushPromises()
    expect(wrapper.text()).toContain('轮到你')
    expect(cells[7 * 15 + 7]!.attributes('aria-label')).toContain('黑棋')
    expect(cells[7 * 15 + 8]!.attributes('aria-label')).toContain('白棋')

    let resolveSecondMove:
      ((move: { row: number; col: number; reason: string }) => void) | undefined
    mockedAgent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondMove = (move) => resolve(agentResult(move.row, move.col, move.reason))
        }),
    )
    await cells[6 * 15 + 7]!.trigger('click')
    expect(wrapper.text()).toContain('AI 正在思考')
    expect(wrapper.text()).not.toContain('靠近中心')
    resolveSecondMove?.({ row: 6, col: 8, reason: '继续防守' })
    await flushPromises()
    expect(wrapper.text()).toContain('继续防守')
  })

  it('uses the best local candidate when the AI request fails', async () => {
    mockedAgent.mockRejectedValue(new Error('网络失败'))
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    const cells = wrapper.findAll('[role="gridcell"]')
    await cells[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('轮到你')
    expect(wrapper.text()).toContain('AI 回合编排')
    expect(wrapper.text()).toContain('Agent 外层编排发生未预期异常')
    expect(wrapper.text()).toContain('网络失败')
    expect(mockedAgent).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.piece')).toHaveLength(2)
    expect(cells[7 * 15 + 8]!.attributes('aria-label')).toContain('白棋')
  })

  it('bypasses the Agent when local search proves a deterministic move', async () => {
    mockedSearch.mockResolvedValue({
      ...searchResult,
      forcedMoveType: 'forcedTactical',
      trace: { ...searchResult.trace, forcedMoveType: 'forcedTactical', finalSource: 'forcedWinSearch' },
    })
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    await wrapper.findAll('[role="gridcell"]')[0]!.trigger('click')
    await flushPromises()
    expect(mockedAgent).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('连续强制战术')
    expect(wrapper.findAll('.piece')).toHaveLength(2)
  })

  it('accepts an Agent move from the protected strategy set outside baseline top results', async () => {
    mockedAgent.mockResolvedValue(agentResult(0, 1, 'expanded strategy candidate'))
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    await wrapper.findAll('[role="gridcell"]')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[role="gridcell"]')[1]!.attributes('aria-label')).toContain('白棋')
    expect(wrapper.text()).toContain('expanded strategy candidate')
  })

  it('ignores an old AI response after restart', async () => {
    let resolveMove: ((move: { row: number; col: number }) => void) | undefined
    mockedAgent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMove = (move) => resolve(agentResult(move.row, move.col))
        }),
    )
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    await wrapper.findAll('[role="gridcell"]')[0]!.trigger('click')
    const restartButton = wrapper
      .findAll('.actions button')
      .find((button) => button.text() === '重新开始')!
    await restartButton.trigger('click')
    resolveMove?.({ row: 1, col: 1 })
    await flushPromises()
    expect(wrapper.text()).toContain('轮到你')
    expect(wrapper.findAll('.piece')).toHaveLength(0)
  })

  it('ignores an old Worker result after restart', async () => {
    let resolveSearch: ((result: SearchResult) => void) | undefined
    mockedSearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
    )
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    await wrapper.findAll('[role="gridcell"]')[0]!.trigger('click')
    const restartButton = wrapper
      .findAll('.actions button')
      .find((button) => button.text() === '重新开始')!
    await restartButton.trigger('click')
    resolveSearch?.(searchResult)
    await flushPromises()
    expect(wrapper.findAll('.piece')).toHaveLength(0)
    expect(mockedAgent).not.toHaveBeenCalled()
  })

  it('starts with AI as black when selected', async () => {
    mockedAgent.mockResolvedValue(agentResult(7, 8, 'black opens near center'))
    const wrapper = mount(App)

    expect(wrapper.find('.start-on-board').exists()).toBe(true)
    await wrapper.find('.start-on-board').trigger('click')
    await wrapper.findAll('.setup-actions button')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.piece')).toHaveLength(1)
    expect(wrapper.findAll('[role="gridcell"]')[7 * 15 + 8]!.attributes('aria-label')).toContain(
      '黑棋',
    )
    expect(mockedSearch).toHaveBeenCalledWith(expect.any(Array), expect.any(AbortSignal), {
      rootPlayer: 1,
    })
  })

  it('provides a semantic control to clear session experience', async () => {
    const wrapper = mount(App)
    const clearButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '清空本次会话经验')!
    await clearButton.trigger('click')
    expect(wrapper.text()).toContain('本次浏览器会话经验已清空')
  })

  it('shows a read-only best-move hint and clears it after moving', async () => {
    mockedAgent.mockResolvedValue(agentResult(7, 8))
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    const hintButton = wrapper
      .findAll('.actions button')
      .find((button) => button.text().includes('最佳提示'))!

    await hintButton.trigger('click')
    await flushPromises()
    expect(wrapper.find('.cell.hint').exists()).toBe(true)
    expect(wrapper.findAll('.piece')).toHaveLength(0)

    await wrapper.findAll('[role="gridcell"]')[0]!.trigger('click')
    expect(wrapper.find('.cell.hint').exists()).toBe(false)
  })

  it('undoes the complete player and AI round', async () => {
    mockedAgent.mockResolvedValue(agentResult(7, 8))
    const wrapper = mount(App)
    await startWithAIWhite(wrapper)
    await wrapper.findAll('[role="gridcell"]')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.piece')).toHaveLength(2)

    const undoButton = wrapper
      .findAll('.actions button')
      .find((button) => button.text() === '悔棋')!
    await undoButton.trigger('click')
    expect(wrapper.findAll('.piece')).toHaveLength(0)
  })

  it('applies the VS Code stealth preset and changes board size without changing the board', async () => {
    const wrapper = mount(App)
    const settings = wrapper.findAll('details')

    await settings[1]!.find('summary').trigger('click')
    await settings[1]!.findAll('button')[2]!.trigger('click')
    expect(wrapper.find('.app-page').attributes('data-theme')).toBe('vscode')
    expect(wrapper.find('.app-page').attributes('data-stealth')).toBe('true')
    expect(wrapper.find('h1').text()).toBe('board.ts')
    expect(wrapper.find('.board').classes()).toContain('palette-vscode')

    await settings[3]!.find('summary').trigger('click')
    await settings[3]!.findAll('button')[2]!.trigger('click')
    expect(wrapper.find('.board').classes()).toContain('board-large')
    expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(225)
  })
})
