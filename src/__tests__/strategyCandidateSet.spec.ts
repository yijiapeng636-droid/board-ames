import { describe, expect, it } from 'vitest'
import { buildStrategyCandidateSet } from '@/games/gomoku/ai/strategy/strategyCandidateSet'
import { createBoard } from '@/games/gomoku/core/game'
import type { SearchResult } from '@/games/gomoku/types/gomoku'

function emptyBaseline(): SearchResult {
  return {
    candidates: [],
    forcedMoveType: null,
    metrics: { candidateCount: 0, searchedNodes: 0, searchDepth: 0, searchDurationMs: 0, cutoffCount: 0, cacheHits: 0, ttStores: 0, extensionNodes: 0, timedOut: false },
    trace: { aiPlayer: 2, sideToMove: 2, generatedCandidateCount: 0, candidates: [], forcedMoveType: null, search: { completedDepth: 0, searchedNodes: 0, cutoffCount: 0, cacheHits: 0, durationMs: 0, timedOut: false }, principalVariation: [], finalSource: 'search' },
  }
}

describe('strategy candidate set', () => {
  it('exposes only deep-search candidates within the acceptable score margin', () => {
    const baseline = emptyBaseline()
    baseline.candidates = [
      { row: 7, col: 7, staticScore: 1, searchScore: 25_000, features: [], principalVariation: [] },
      { row: 7, col: 8, staticScore: 1, searchScore: 18_000, features: [], principalVariation: [] },
      { row: 7, col: 9, staticScore: 1, searchScore: -99_000, features: ['doubleThreat'], principalVariation: [] },
    ]

    const candidates = buildStrategyCandidateSet(createBoard(), 2, baseline)
    expect(candidates.map(({ row, col }) => [row, col])).toEqual([[7, 7]])
  })

  it('keeps a forcing point even when it is absent from baseline final candidates', () => {
    const board = createBoard()
    board[7]![5] = 2
    board[7]![6] = 2
    board[5]![7] = 2
    board[6]![7] = 2
    const candidates = buildStrategyCandidateSet(board, 2, emptyBaseline(), 3)
    expect(candidates).toContainEqual(expect.objectContaining({ row: 7, col: 7, protected: true }))
    expect(candidates.find((candidate) => candidate.row === 7 && candidate.col === 7)?.sources).toContain('forcing')
  })

  it('remains finite while allowing protected candidates beyond the soft target', () => {
    const board = createBoard()
    board[7]![5] = 2
    board[7]![6] = 2
    board[5]![7] = 2
    board[6]![7] = 2
    const candidates = buildStrategyCandidateSet(board, 2, emptyBaseline(), 1)
    expect(candidates.length).toBeGreaterThanOrEqual(1)
    expect(candidates.length).toBeLessThanOrEqual(28)
  })
})
