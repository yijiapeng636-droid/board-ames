import { generateCandidatePool } from '@/games/gomoku/ai/candidates'
import type { Board, Player } from '@/games/gomoku/types/gomoku'
import type { PositionInspection } from './strategyTypes'
const positions = (items: Array<{ row: number; col: number }>) => items.map(({ row, col }) => ({ row, col }))
export function inspectGomokuPosition(board: Board, aiPlayer: Player): PositionInspection {
  const opponent: Player = aiPlayer === 1 ? 2 : 1
  const own = generateCandidatePool(board, aiPlayer, 28)
  const opposing = generateCandidatePool(board, opponent, 28)
  return {
    aiPlayer: aiPlayer === 1 ? 'black' : 'white', immediateWins: positions(own.filter((move) => move.immediateWin)),
    opponentImmediateWins: positions(opposing.filter((move) => move.immediateWin)),
    mandatoryDefense: { required: opposing.some((move) => move.immediateWin), moves: positions(own.filter((move) => move.blocksImmediateWin)) },
    forcingMoves: positions(own.filter((move) => move.forcesReply || move.createsDoubleThreat || move.createsFourThree)),
    opponentForcingMoves: positions(opposing.filter((move) => move.forcesReply || move.createsDoubleThreat || move.createsFourThree)),
  }
}
