import {
  BOARD_SIZE,
  type Board,
  type GamePhase,
  type GameResult,
  type Move,
  type Player,
} from '@/games/gomoku/types/gomoku'
import { getWinner } from './winner'

export function createBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<0>(BOARD_SIZE).fill(0))
}

export function isInBounds(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < BOARD_SIZE &&
    col >= 0 &&
    col < BOARD_SIZE
  )
}

export function isBoardFull(board: Board): boolean {
  return board.every((line) => line.every((piece) => piece !== 0))
}

export function placePiece(
  board: Board,
  moves: Move[],
  row: number,
  col: number,
  player: Player,
  phase?: GamePhase,
): void {
  if (phase === 'gameOver') throw new Error('游戏已经结束')
  if (!isInBounds(row, col)) throw new Error('落点超出棋盘范围')
  if (board[row]![col] !== 0) throw new Error('该位置已有棋子')

  board[row]![col] = player
  moves.push({ turn: moves.length + 1, player, row, col })
}

export function resultAfterMove(board: Board, row: number, col: number): GameResult {
  const winner = getWinner(board, row, col)
  if (winner === 1) return 'blackWin'
  if (winner === 2) return 'whiteWin'
  return isBoardFull(board) ? 'draw' : null
}
