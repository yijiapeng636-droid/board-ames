import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

export const SCREENSHOT_DOUBLE_THREAT_MOVE = { row: 9, col: 4 } as const
export const SCREENSHOT_DOUBLE_THREAT_PLAYER: Player = 2

const PIECES: Array<[row: number, col: number, player: Player]> = [
  [5, 1, 1], [5, 3, 1], [5, 9, 1],
  [6, 5, 1], [6, 6, 1], [6, 7, 1],
  [7, 5, 1], [7, 6, 1],
  [8, 2, 1], [8, 7, 1],
  [10, 3, 1], [10, 4, 1], [10, 6, 1],
  [12, 5, 1],

  [5, 4, 2],
  [6, 2, 2], [6, 3, 2], [6, 8, 2],
  [7, 3, 2], [7, 7, 2],
  [8, 3, 2], [8, 4, 2], [8, 5, 2], [8, 6, 2],
  [9, 3, 2], [9, 5, 2],
  [10, 5, 2], [11, 5, 2],
]

export function createScreenshotDoubleThreatBoard(): Board {
  const board = createBoard()
  for (const [row, col, player] of PIECES) board[row]![col] = player
  return board
}
