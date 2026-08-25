import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeGameReviewPoints } from '@/games/gomoku/ai/review'
import { requestGameReview } from '@/games/gomoku/ai/reviewDeepseek'
import { formatGomokuCoordinate } from '@/games/gomoku/core/coordinate'
import type { Move, ReviewPoint } from '@/games/gomoku/types/gomoku'

const whiteFour: Move[] = [
  { turn: 1, player: 2, row: 7, col: 0 },
  { turn: 2, player: 2, row: 7, col: 1 },
  { turn: 3, player: 2, row: 7, col: 2 },
  { turn: 4, player: 2, row: 7, col: 3 },
]

afterEach(() => vi.unstubAllGlobals())

describe('local game review', () => {
  it('does not manufacture three mistakes when only one local mistake exists', () => {
    const moves: Move[] = [...whiteFour, { turn: 5, player: 1, row: 0, col: 0 }]
    const original = structuredClone(moves)
    const points = analyzeGameReviewPoints(moves, 1)
    expect(moves).toEqual(original)
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ moveNumber: 5, player: 'black', classification: 'mistake', playedMove: { row: 0, col: 0 } })
    expect(points[0]!.recommendedSearchScore).toBeGreaterThan(points[0]!.actualSearchScore)
  })

  it('does not classify the actually recommended move as a mistake', () => {
    const moves: Move[] = [...whiteFour, { turn: 5, player: 1, row: 7, col: 4 }]
    expect(analyzeGameReviewPoints(moves, 1)).toEqual([])
  })

  it('uses one shared 1-based formatter for UI coordinates', () => {
    expect(formatGomokuCoordinate({ row: 8, col: 9 })).toBe('(9, 10)')
  })

  it('sanitizes unknown and duplicate model key moments', async () => {
    const point: ReviewPoint = {
      moveNumber: 5,
      player: 'black',
      playedMove: { row: 0, col: 0 },
      recommendedMove: { row: 7, col: 7 },
      actualSearchScore: 1,
      recommendedSearchScore: 9,
      classification: 'mistake',
      evidence: ['same_search_gap:8'],
      tacticalFacts: { actual: ['positional'], recommended: ['blockFive'] },
      features: ['blockFive'],
      principalVariation: [{ player: 'black', row: 7, col: 7 }],
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      summary: 'summary',
      keyMoments: [
        { moveNumber: 99, title: 'invented', explanation: 'x', suggestion: 'x' },
        { moveNumber: 5, title: 'valid', explanation: '不要走 (8, 9)', suggestion: '改走第9行第10列' },
        { moveNumber: 5, title: 'duplicate', explanation: 'x', suggestion: 'x' },
      ],
      strengths: [], recurringIssues: [], practiceSuggestions: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const review = await requestGameReview('whiteWin', [], [point], { reviewedGames: 0, repeatedMistakeTags: [], recentLessons: [] })
    expect(review.keyMoments).toEqual([{ moveNumber: 5, title: 'valid', explanation: '不要走 该位置', suggestion: '改走该位置' }])
  })
})
