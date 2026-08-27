import { SEARCH_WIN_SCORE } from '@/games/gomoku/ai/searchConfig'
import { getNearbyEmptyCells } from '@/games/gomoku/ai/candidates'
import { analyzeBoardThreat, analyzeThreat } from '@/games/gomoku/ai/threatAnalysis'
import { BOARD_SIZE, type AICandidate, type Board, type Player } from '@/games/gomoku/types/gomoku'

export interface PositionFacts {
  five: number
  openFour: number
  closedFour: number
  openThree: number
  closedThree: number
  openTwo: number
  forcingLines: number
  multiThreat: boolean
  connectionScore: number
}

export interface LeafTacticalFacts {
  sideToMove: Player
  immediateWins: Array<{ row: number; col: number }>
  opponentImmediateWins: Array<{ row: number; col: number }>
  mandatoryBlocks: Array<{ row: number; col: number }>
  forcingMoves: Array<{ row: number; col: number }>
  sameMoveMultiThreats: Array<{ row: number; col: number }>
}

const STRUCTURE_VALUES = {
  openFour: 400_000,
  closedFour: 90_000,
  openThree: 14_000,
  closedThree: 2_200,
  openTwo: 500,
} as const

export function inspectPlayerPosition(board: Board, player: Player): PositionFacts {
  const facts: PositionFacts = { five: 0, openFour: 0, closedFour: 0, openThree: 0, closedThree: 0, openTwo: 0, forcingLines: 0, multiThreat: false, connectionScore: 0 }
  const threat = analyzeBoardThreat(board, player)
  facts.five = threat.fives.length
  facts.openFour = threat.openFours.length
  facts.closedFour = threat.lines.filter((line) => line.pattern === 'closedFour').length
  facts.openThree = threat.openThrees.length
  facts.closedThree = threat.lines.filter((line) => line.pattern === 'closedThree').length
  facts.openTwo = threat.lines.filter((line) => line.pattern === 'openTwo').length
  facts.multiThreat = threat.doubleThreat
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row]?.[col] !== player) continue
      facts.connectionScore += 14 - (Math.abs(row - 7) + Math.abs(col - 7))
    }
  }
  facts.forcingLines = facts.openFour + facts.closedFour + facts.openThree
  return facts
}

function factsScore(facts: PositionFacts): number {
  if (facts.five > 0) return SEARCH_WIN_SCORE
  const structure = facts.openFour * STRUCTURE_VALUES.openFour + facts.closedFour * STRUCTURE_VALUES.closedFour + facts.openThree * STRUCTURE_VALUES.openThree + facts.closedThree * STRUCTURE_VALUES.closedThree + facts.openTwo * STRUCTURE_VALUES.openTwo
  const multiThreat = facts.multiThreat ? 180_000 : 0
  const constrainedReplies = facts.openFour > 0 ? 40_000 : facts.closedFour > 0 ? 8_000 : 0
  return structure + multiThreat + constrainedReplies + facts.connectionScore
}

export function inspectLeafTactics(
  board: Board,
  sideToMove: Player,
  knownSideCandidates?: readonly AICandidate[],
): LeafTacticalFacts {
  const opponent: Player = sideToMove === 1 ? 2 : 1
  const scanTacticalMoves = (player: Player) => {
    const immediateWins: Array<{ row: number; col: number }> = []
    const forcingMoves: Array<{ row: number; col: number }> = []
    const sameMoveMultiThreats: Array<{ row: number; col: number }> = []
    for (const { row, col } of getNearbyEmptyCells(board)) {
        const threat = analyzeThreat(board, { row, col }, player)
        const move = { row, col }
        if (threat.winNow) immediateWins.push(move)
        if (threat.winNow || threat.fours.length > 0 || threat.doubleThreat) forcingMoves.push(move)
        if (threat.doubleThreat) sameMoveMultiThreats.push(move)
    }
    return { immediateWins, forcingMoves, sameMoveMultiThreats }
  }
  const side = knownSideCandidates
    ? {
        immediateWins: knownSideCandidates.filter((move) => move.immediateWin).map(({ row, col }) => ({ row, col })),
        forcingMoves: knownSideCandidates.filter((move) => move.forcesReply || move.createsFourThree || move.createsDoubleThreat).map(({ row, col }) => ({ row, col })),
        sameMoveMultiThreats: knownSideCandidates.filter((move) => move.createsFourThree || move.createsDoubleThreat).map(({ row, col }) => ({ row, col })),
      }
    : scanTacticalMoves(sideToMove)
  const opponentFacts = scanTacticalMoves(opponent)
  return {
    sideToMove,
    immediateWins: side.immediateWins,
    opponentImmediateWins: opponentFacts.immediateWins,
    mandatoryBlocks: opponentFacts.immediateWins.map((move) => ({ ...move })),
    forcingMoves: side.forcingMoves,
    sameMoveMultiThreats: side.sameMoveMultiThreats,
  }
}

export function evaluatePosition(
  board: Board,
  perspectivePlayer: Player,
  sideToMove: Player = perspectivePlayer,
  knownSideCandidates?: readonly AICandidate[],
): number {
  const opponent: Player = perspectivePlayer === 1 ? 2 : 1
  const own = inspectPlayerPosition(board, perspectivePlayer)
  const other = inspectPlayerPosition(board, opponent)
  if (own.five > 0 && other.five === 0) return SEARCH_WIN_SCORE
  if (other.five > 0 && own.five === 0) return -SEARCH_WIN_SCORE
  if (own.five > 0 && other.five > 0) return 0
  const structuralScore = factsScore(own) - factsScore(other)
  const tactics = inspectLeafTactics(board, sideToMove, knownSideCandidates)
  const direction = sideToMove === perspectivePlayer ? 1 : -1
  if (tactics.immediateWins.length > 0) return direction * (SEARCH_WIN_SCORE - 100)
  const forcingScore = Math.min(tactics.forcingMoves.length, 3) * 12_000
  const multiThreatScore = tactics.sameMoveMultiThreats.length > 0 ? 180_000 : 0
  const unresolvedThreatPenalty = tactics.opponentImmediateWins.length > 0 ? 45_000 : 0
  return structuralScore + direction * (forcingScore + multiThreatScore - unresolvedThreatPenalty)
}
