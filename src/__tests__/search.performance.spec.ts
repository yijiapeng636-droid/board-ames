import { describe, expect, it } from 'vitest'
import { searchPosition } from '@/games/gomoku/ai/search'
import { createBoard } from '@/games/gomoku/core/game'
import type { Player } from '@/games/gomoku/types/gomoku'

const scenarios: Record<string, Array<[number, number, Player]>> = {
  opening: [[7, 7, 1]],
  middlegame: [
    [7, 7, 1],
    [7, 8, 2],
    [6, 7, 1],
    [8, 7, 2],
    [6, 6, 1],
    [8, 8, 2],
  ],
  dense: [
    [3, 3, 1],
    [4, 8, 2],
    [3, 10, 1],
    [5, 3, 2],
    [6, 5, 1],
    [8, 10, 2],
    [6, 9, 1],
    [10, 5, 2],
    [9, 4, 1],
    [11, 8, 2],
    [10, 10, 1],
    [7, 7, 2],
  ],
}

describe('search performance samples', () => {
  for (const [name, pieces] of Object.entries(scenarios)) {
    it(`records real metrics for ${name}`, () => {
      const board = createBoard()
      for (const [row, col, player] of pieces) board[row]![col] = player
      const result = searchPosition(board)
      console.info(`SEARCH_PERF ${name} ${JSON.stringify(result.metrics)}`)
      expect(result.candidates.length).toBeGreaterThan(0)
      expect(result.metrics.searchDepth).toBeLessThanOrEqual(3)
      expect(result.metrics.searchDurationMs).toBeGreaterThanOrEqual(0)
    })
  }
})
