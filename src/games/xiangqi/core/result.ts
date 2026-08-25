import { oppositeSide } from '@/games/xiangqi/core/board'
import { findGeneral, generateLegalMoves, isInCheck } from '@/games/xiangqi/core/legalMoves'
import type {
  XiangqiBoard,
  XiangqiGameStatus,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

function winner(side: XiangqiSide) {
  return side === 'red' ? ('redWin' as const) : ('blackWin' as const)
}

export function hasInsufficientMatingMaterial(board: XiangqiBoard): boolean {
  return board
    .flat()
    .filter((piece) => piece && piece.type !== 'general')
    .every((piece) => piece?.type === 'advisor' || piece?.type === 'elephant')
}

export function getXiangqiGameStatus(
  board: XiangqiBoard,
  sideToMove: XiangqiSide,
): XiangqiGameStatus {
  if (!findGeneral(board, sideToMove)) {
    return {
      sideToMove,
      inCheck: true,
      legalMoves: [],
      result: winner(oppositeSide(sideToMove)),
      reason: 'generalCaptured',
    }
  }
  if (hasInsufficientMatingMaterial(board)) {
    return {
      sideToMove,
      inCheck: false,
      legalMoves: generateLegalMoves(board, sideToMove),
      result: 'draw',
      reason: 'insufficientMaterial',
    }
  }
  const inCheck = isInCheck(board, sideToMove)
  const legalMoves = generateLegalMoves(board, sideToMove)
  if (legalMoves.length > 0) return { sideToMove, inCheck, legalMoves, result: null, reason: null }
  return {
    sideToMove,
    inCheck,
    legalMoves,
    result: winner(oppositeSide(sideToMove)),
    reason: inCheck ? 'checkmate' : 'stalemate',
  }
}
