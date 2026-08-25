import { cloneXiangqiBoard, oppositeSide } from '@/games/xiangqi/core/board'
import { generatePseudoLegalMoves } from '@/games/xiangqi/core/pieceMoves'
import type {
  XiangqiBoard,
  XiangqiMoveOption,
  XiangqiPosition,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

function samePosition(left: XiangqiPosition, right: XiangqiPosition): boolean {
  return left.row === right.row && left.col === right.col
}

export function findGeneral(board: XiangqiBoard, side: XiangqiSide): XiangqiPosition | null {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < (board[row]?.length ?? 0); col += 1) {
      const piece = board[row]?.[col]
      if (piece?.side === side && piece.type === 'general') return { row, col }
    }
  }
  return null
}

export function applyXiangqiMove(board: XiangqiBoard, move: XiangqiMoveOption): XiangqiBoard {
  const next = cloneXiangqiBoard(board)
  const source = next[move.from.row]?.[move.from.col]
  if (!source || source.id !== move.piece.id || source.side !== move.side) {
    throw new Error('走子起点与棋盘不一致')
  }
  next[move.from.row]![move.from.col] = null
  next[move.to.row]![move.to.col] = { ...source }
  return next
}

function hasClearFileBetween(
  board: XiangqiBoard,
  first: XiangqiPosition,
  second: XiangqiPosition,
): boolean {
  if (first.col !== second.col) return false
  for (let row = Math.min(first.row, second.row) + 1; row < Math.max(first.row, second.row); row += 1) {
    if (board[row]?.[first.col]) return false
  }
  return true
}

export function areGeneralsFacing(board: XiangqiBoard): boolean {
  const red = findGeneral(board, 'red')
  const black = findGeneral(board, 'black')
  return Boolean(red && black && hasClearFileBetween(board, red, black))
}

export function isSquareAttacked(
  board: XiangqiBoard,
  target: XiangqiPosition,
  bySide: XiangqiSide,
): boolean {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < (board[row]?.length ?? 0); col += 1) {
      const piece = board[row]?.[col]
      if (!piece || piece.side !== bySide) continue
      const from = { row, col }
      if (piece.type === 'general') {
        const opposingGeneral = board[target.row]?.[target.col]
        if (
          opposingGeneral?.type === 'general' &&
          opposingGeneral.side !== bySide &&
          hasClearFileBetween(board, from, target)
        ) {
          return true
        }
      }
      if (generatePseudoLegalMoves(board, from).some((move) => samePosition(move, target))) {
        return true
      }
    }
  }
  return false
}

export function isInCheck(board: XiangqiBoard, side: XiangqiSide): boolean {
  const general = findGeneral(board, side)
  return general === null || isSquareAttacked(board, general, oppositeSide(side))
}

export function generatePseudoMoveOptions(
  board: XiangqiBoard,
  side: XiangqiSide,
): XiangqiMoveOption[] {
  const moves: XiangqiMoveOption[] = []
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < (board[row]?.length ?? 0); col += 1) {
      const piece = board[row]?.[col]
      if (!piece || piece.side !== side) continue
      const from = { row, col }
      for (const to of generatePseudoLegalMoves(board, from)) {
        moves.push({ side, from, to, piece: { ...piece }, captured: board[to.row]?.[to.col] ?? null })
      }
    }
  }
  return moves
}

export function generateLegalMoves(
  board: XiangqiBoard,
  side: XiangqiSide,
): XiangqiMoveOption[] {
  if (!findGeneral(board, side)) return []
  return generatePseudoMoveOptions(board, side).filter((move) => {
    const next = applyXiangqiMove(board, move)
    return !areGeneralsFacing(next) && !isInCheck(next, side)
  })
}
