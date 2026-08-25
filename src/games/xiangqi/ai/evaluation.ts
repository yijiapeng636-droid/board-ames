import { generatePseudoMoveOptions, isInCheck } from '@/games/xiangqi/core/legalMoves'
import type { XiangqiBoard, XiangqiPieceType, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

export const XIANGQI_EVALUATION = {
  material: { general: 100_000, rook: 900, cannon: 450, horse: 420, elephant: 200, advisor: 200, pawn: 100 } satisfies Record<XiangqiPieceType, number>,
  mobility: 3,
  kingSafety: 120,
  checkPressure: 80,
  pawnAdvancement: 12,
} as const

export function evaluateXiangqiBoard(board: XiangqiBoard, perspective: XiangqiSide): number {
  let score = 0
  for (let row = 0; row < board.length; row += 1) {
    for (const piece of board[row] ?? []) {
      if (!piece) continue
      const sign = piece.side === perspective ? 1 : -1
      score += sign * XIANGQI_EVALUATION.material[piece.type]
      if (piece.type === 'pawn') {
        const advancement = piece.side === 'red' ? 6 - row : row - 3
        score += sign * Math.max(0, advancement) * XIANGQI_EVALUATION.pawnAdvancement
      }
    }
  }
  const opponent: XiangqiSide = perspective === 'red' ? 'black' : 'red'
  score += (generatePseudoMoveOptions(board, perspective).length - generatePseudoMoveOptions(board, opponent).length) * XIANGQI_EVALUATION.mobility
  if (isInCheck(board, opponent)) score += XIANGQI_EVALUATION.checkPressure
  if (isInCheck(board, perspective)) score -= XIANGQI_EVALUATION.kingSafety
  return score
}
