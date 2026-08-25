import { describe, expect, it, vi } from 'vitest'
import { searchPosition } from '@/games/gomoku/ai/search'
import { gomokuStrategyTools } from '@/games/gomoku/ai/strategy/strategyTools'
import { buildStrategyCandidateSet } from '@/games/gomoku/ai/strategy/strategyCandidateSet'
import { inspectGomokuPosition } from '@/games/gomoku/ai/strategy/positionInspection'
import type { GomokuAgentContext } from '@/games/gomoku/ai/strategy/strategyTypes'
import { createBoard } from '@/games/gomoku/core/game'

function context(): GomokuAgentContext {
  const board = createBoard()
  board[7]![7] = 1
  const baseline = searchPosition(board, { rootPlayer: 2, maxDepth: 1, maxMs: 500 })
  return {
    board: board.map((line) => [...line]),
    moves: [{ turn: 1, player: 1, row: 7, col: 7 }],
    aiPlayer: 2,
    humanPlayer: 1,
    sideToMove: 2,
    positionKey: 'fixture',
    positionInspection: inspectGomokuPosition(board, 2),
    allowedCandidates: buildStrategyCandidateSet(board, 2, baseline),
    baselineSearch: baseline,
    runSearch: vi.fn<GomokuAgentContext['runSearch']>(async () => baseline),
    runFixedSearch: vi.fn<GomokuAgentContext['runFixedSearch']>(async (_board, move) => ({ move, searchScore: 900, completedDepth: 4, timedOut: false, principalVariation: [{ player: 'white', ...move }, { player: 'black', row: 6, col: 6 }], forcedWin: false, opponentBestReply: { row: 6, col: 6 }, metrics: { searchedNodes: 40, cacheHits: 3, cutoffs: 7, durationMs: 10, ttStores: 8, extensionNodes: 0 } })),
    runThreatSearch: vi.fn<GomokuAgentContext['runThreatSearch']>(async () => ({ status: 'not_proven', found: false, forcedWin: false, principalVariation: [], searchedNodes: 4, durationMs: 1, timedOut: false })),
    runThreatSearchFromMove: vi.fn<GomokuAgentContext['runThreatSearchFromMove']>(async (_board, _player, move) => ({ status: 'proven_win', found: true, forcedWin: true, winningMove: move, plyToWin: 3, principalVariation: [{ player: 'white', ...move }], searchedNodes: 4, durationMs: 1, timedOut: false })),
  }
}

function tool(name: string) { return gomokuStrategyTools.find((item) => item.name === name)! }

describe('gomoku strategy tools', () => {
  it('exposes exactly the three bounded search tools', () => {
    expect(gomokuStrategyTools.map((item) => item.name)).toEqual(['search_forced_win', 'search_candidate', 'compare_candidates'])
  })

  it('rejects malformed and candidate-set-outside coordinates', async () => {
    const value = context()
    await expect(tool('search_candidate').execute({ move: { row: 7.5, col: 8 }, mode: 'quick' }, value, new AbortController().signal)).rejects.toThrow('integers')
    await expect(tool('search_candidate').execute({ move: { row: 0, col: 0 }, mode: 'quick' }, value, new AbortController().signal)).rejects.toThrow('allowedCandidates')
  })

  it('returns separated facts and search evidence instead of a single total score', async () => {
    const value = context()
    const candidate = value.allowedCandidates[0]!
    if (value.baselineSearch.candidates[0]) value.baselineSearch.candidates[0].searchScore = 100
    const result = await tool('search_candidate').execute({ move: { row: candidate.row, col: candidate.col }, mode: 'normal' }, value, new AbortController().signal)
    expect(result).toMatchObject({ attackScore: expect.any(Number), defenseScore: expect.any(Number), orderingScore: expect.any(Number), completedDepth: expect.any(Number), tacticalFacts: expect.any(Object) })
    expect(result).toMatchObject({ searchScore: 900 })
    expect((result as { principalVariation: unknown[] }).principalVariation[0]).toEqual({ player: 'white', row: candidate.row, col: candidate.col })
    expect(value.runFixedSearch).toHaveBeenCalledOnce()
  })

  it('limits candidate comparison input and propagates AbortSignal to search', async () => {
    const value = context()
    await expect(tool('compare_candidates').execute({ moves: [], mode: 'quick' }, value, new AbortController().signal)).rejects.toThrow('2 to 4')
    const moves = value.allowedCandidates.slice(0, 2).map(({ row, col }) => ({ row, col }))
    await expect(tool('compare_candidates').execute({ moves: [moves[0], moves[0]], mode: 'quick' }, value, new AbortController().signal)).rejects.toThrow('duplicates')
    vi.mocked(value.runFixedSearch).mockImplementation(async (_board, move) => ({ move, searchScore: move.row === moves[0]!.row && move.col === moves[0]!.col ? 900 : 300, completedDepth: 3, timedOut: false, principalVariation: [{ player: 'white', ...move }], forcedWin: false, metrics: { searchedNodes: 10, cacheHits: 1, cutoffs: 2, durationMs: 3, ttStores: 2, extensionNodes: 0 } }))
    const controller = new AbortController()
    const results = await tool('compare_candidates').execute({ moves: [...moves].reverse(), mode: 'quick' }, value, controller.signal) as Array<{ move: { row: number; col: number }; searchScore: number }>
    expect(value.runFixedSearch).toHaveBeenCalledTimes(2)
    expect(results.map((result) => result.searchScore)).toEqual([300, 900])
  })

  it('proves the requested move instead of comparing it with the global winning move', async () => {
    const value = context()
    const candidate = value.allowedCandidates[1] ?? value.allowedCandidates[0]!
    const result = await tool('search_forced_win').execute({ move: { row: candidate.row, col: candidate.col } }, value, new AbortController().signal)
    expect(result).toMatchObject({ status: 'proven_win', forcedWin: true, analyzedMove: { row: candidate.row, col: candidate.col } })
    expect(value.runThreatSearchFromMove).toHaveBeenCalledOnce()
    expect(value.runThreatSearch).not.toHaveBeenCalled()
  })
})
