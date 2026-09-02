import { generateCandidatePool } from '@/games/gomoku/ai/candidates'
import { findWinningMoves } from '@/games/gomoku/ai/threatAnalysis'
import type { Board, Player } from '@/games/gomoku/types/gomoku'
import type { DefenseUrgency, PositionInspection, StrategyPosition } from './strategyTypes'
const positions = (items: Array<{ row: number; col: number }>) => items.map(({ row, col }) => ({ row, col }))

function boardAfter(board: Board, move: StrategyPosition, player: Player): Board {
  const next = board.map((line) => [...line])
  next[move.row]![move.col] = player
  return next
}

export function findNextTurnForks(board: Board, player: Player): StrategyPosition[] {
  return positions(generateCandidatePool(board, player, 28).filter((move) => {
    if (move.immediateWin) return false
    return findWinningMoves(boardAfter(board, move, player), player).length >= 2
  }))
}

function inspectMandatoryDefense(board: Board, aiPlayer: Player) {
  const opponent: Player = aiPlayer === 1 ? 2 : 1
  const opponentWinningMoves = findWinningMoves(board, opponent)
  if (opponentWinningMoves.length >= 2) {
    return { required: true, urgency: 'multipleImmediateWins' as DefenseUrgency, unavoidable: true, moves: [] }
  }

  const own = generateCandidatePool(board, aiPlayer, 28)
  if (opponentWinningMoves.length === 1) {
    return {
      required: true,
      urgency: 'immediateWin' as DefenseUrgency,
      unavoidable: false,
      moves: positions(own.filter((move) => move.blocksImmediateWin)),
    }
  }

  if (findNextTurnForks(board, opponent).length === 0) {
    return { required: false, urgency: 'none' as DefenseUrgency, unavoidable: false, moves: [] }
  }

  const safeMoves = own.filter((move) => {
    const next = boardAfter(board, move, aiPlayer)
    return findWinningMoves(next, opponent).length === 0 && findNextTurnForks(next, opponent).length === 0
  })
  return {
    required: true,
    urgency: 'nextTurnFork' as DefenseUrgency,
    unavoidable: safeMoves.length === 0,
    moves: positions(safeMoves),
  }
}

export function inspectGomokuPosition(board: Board, aiPlayer: Player): PositionInspection {
  const opponent: Player = aiPlayer === 1 ? 2 : 1
  const own = generateCandidatePool(board, aiPlayer, 28)
  const opposing = generateCandidatePool(board, opponent, 28)
  return {
    aiPlayer: aiPlayer === 1 ? 'black' : 'white', immediateWins: positions(own.filter((move) => move.immediateWin)),
    opponentImmediateWins: positions(opposing.filter((move) => move.immediateWin)),
    mandatoryDefense: inspectMandatoryDefense(board, aiPlayer),
    forcingMoves: positions(own.filter((move) => move.forcesReply || move.createsDoubleThreat || move.createsFourThree)),
    opponentForcingMoves: positions(opposing.filter((move) => move.forcesReply || move.createsDoubleThreat || move.createsFourThree)),
  }
}
