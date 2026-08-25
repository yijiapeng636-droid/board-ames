import type { Board, Player } from '@/games/gomoku/types/gomoku'

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

function count(board: Board, row: number, col: number, rowStep: number, colStep: number) {
  const player = board[row]?.[col]
  if (!player) return 0

  let total = 0
  let currentRow = row + rowStep
  let currentCol = col + colStep
  while (board[currentRow]?.[currentCol] === player) {
    total += 1
    currentRow += rowStep
    currentCol += colStep
  }
  return total
}

export function hasWinner(board: Board, row: number, col: number): boolean {
  if (!board[row]?.[col]) return false
  return DIRECTIONS.some(
    ([rowStep, colStep]) =>
      1 + count(board, row, col, rowStep, colStep) + count(board, row, col, -rowStep, -colStep) >=
      5,
  )
}

export function getWinner(board: Board, row: number, col: number): Player | null {
  return hasWinner(board, row, col) ? (board[row]![col] as Player) : null
}
