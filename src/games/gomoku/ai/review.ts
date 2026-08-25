import { evaluateCandidate } from '@/games/gomoku/ai/candidates'
import { searchFixedCandidate, searchPosition } from '@/games/gomoku/ai/search'
import { createBoard } from '@/games/gomoku/core/game'
import type { Move, Player, ReviewPoint } from '@/games/gomoku/types/gomoku'

const REVIEW_MAX_POINTS = 5
const REVIEW_MISTAKE_THRESHOLD = 2_000
const REVIEW_SEARCH_OPTIONS = { maxDepth: 2, maxMs: 180, branchLimit: 6 } as const

function playerName(player: Player): 'black' | 'white' { return player === 1 ? 'black' : 'white' }

export function analyzeGameReviewPoints(moves: Move[], humanPlayer: Player = 1): ReviewPoint[] {
  const board = createBoard()
  const mistakes: Array<{ point: ReviewPoint; gap: number }> = []

  for (const move of moves) {
    if (move.player === humanPlayer && board[move.row]?.[move.col] === 0) {
      const baseline = searchPosition(board, { ...REVIEW_SEARCH_OPTIONS, rootPlayer: move.player, finalCandidateLimit: 5 })
      const recommended = baseline.candidates[0]
      if (recommended && (recommended.row !== move.row || recommended.col !== move.col)) {
        const actualSearch = searchFixedCandidate(board, move, move.player, REVIEW_SEARCH_OPTIONS)
        const recommendedSearch = searchFixedCandidate(board, recommended, move.player, REVIEW_SEARCH_OPTIONS)
        const gap = recommendedSearch.searchScore - actualSearch.searchScore
        if (gap >= REVIEW_MISTAKE_THRESHOLD) {
          const actualFacts = evaluateCandidate(board, move.row, move.col, move.player)
          const recommendedFacts = evaluateCandidate(board, recommended.row, recommended.col, move.player)
          mistakes.push({
            gap,
            point: {
              moveNumber: move.turn,
              player: playerName(move.player),
              playedMove: { row: move.row, col: move.col },
              recommendedMove: { row: recommended.row, col: recommended.col },
              actualSearchScore: actualSearch.searchScore,
              recommendedSearchScore: recommendedSearch.searchScore,
              classification: 'mistake',
              evidence: [
                `same_search_gap:${gap}`,
                `actual_depth:${actualSearch.completedDepth}`,
                `recommended_depth:${recommendedSearch.completedDepth}`,
                ...recommendedFacts.features.map((feature) => `recommended:${feature}`),
              ],
              tacticalFacts: {
                actual: [...actualFacts.features],
                recommended: [...recommendedFacts.features],
              },
              features: [...recommendedFacts.features],
              principalVariation: recommendedSearch.principalVariation.map((step) => ({ ...step })),
            },
          })
        }
      }
    }
    if (board[move.row]?.[move.col] === 0) board[move.row]![move.col] = move.player
  }

  return mistakes
    .sort((left, right) => right.gap - left.gap || left.point.moveNumber - right.point.moveNumber)
    .slice(0, REVIEW_MAX_POINTS)
    .map(({ point }) => point)
    .sort((left, right) => left.moveNumber - right.moveNumber)
}
