import { PATTERN_SCORES, SEARCH_WIN_SCORE } from '@/games/gomoku/ai/searchConfig'
import { getNearbyEmptyCells } from '@/games/gomoku/ai/candidates'
import { analyzeBoardThreat, analyzeThreat } from '@/games/gomoku/ai/threatAnalysis'
import {
  BOARD_CENTER,
  BOARD_LAST_INDEX,
  BOARD_SIZE,
  type AICandidate,
  type Board,
  type Player,
} from '@/games/gomoku/types/gomoku'

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

const TACTICAL_DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

function hasThreatSupport(board: Board, row: number, col: number, player: Player) {
  return TACTICAL_DIRECTIONS.some(([rowStep, colStep]) => {
    let stones = 0
    for (let offset = -4; offset <= 4; offset += 1) {
      if (offset !== 0 && board[row + rowStep * offset]?.[col + colStep * offset] === player) {
        stones += 1
      }
    }
    return stones >= 2
  })
}

export function inspectPlayerPosition(board: Board, player: Player): PositionFacts {
  const facts: PositionFacts = {
    five: 0,
    openFour: 0,
    closedFour: 0,
    openThree: 0,
    closedThree: 0,
    openTwo: 0,
    forcingLines: 0,
    multiThreat: false,
    connectionScore: 0,
  }
  const threat = analyzeBoardThreat(board, player, { includeDefenseSquares: false })
  facts.five = threat.fives.length
  facts.openFour = threat.openFours.length
  facts.closedFour = threat.lines.filter(
    (line) => line.pattern === 'closedFour' || line.pattern === 'brokenFour',
  ).length
  facts.openThree = threat.threeThreats.length
  facts.closedThree = threat.lines.filter((line) => line.pattern === 'closedThree').length
  facts.openTwo = threat.lines.filter((line) => line.pattern === 'openTwo').length
  facts.multiThreat = threat.doubleThreat
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row]?.[col] !== player) continue
      facts.connectionScore +=
        BOARD_LAST_INDEX - (Math.abs(row - BOARD_CENTER) + Math.abs(col - BOARD_CENTER))
    }
  }
  facts.forcingLines = facts.openFour + facts.closedFour + facts.openThree
  return facts
}

function factsScore(facts: PositionFacts): number {
  if (facts.five > 0) return SEARCH_WIN_SCORE
  const structure =
    facts.openFour * PATTERN_SCORES.openFour +
    facts.closedFour * PATTERN_SCORES.closedFour +
    facts.openThree * PATTERN_SCORES.openThree +
    facts.closedThree * PATTERN_SCORES.closedThree +
    facts.openTwo * PATTERN_SCORES.openTwo
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
      if (!hasThreatSupport(board, row, col, player)) continue
      const threat = analyzeThreat(board, { row, col }, player, { includeDefenseSquares: false })
      const move = { row, col }
      if (threat.winNow) immediateWins.push(move)
      if (threat.winNow || threat.fours.length > 0 || threat.doubleThreat) forcingMoves.push(move)
      if (threat.doubleThreat) sameMoveMultiThreats.push(move)
    }
    return { immediateWins, forcingMoves, sameMoveMultiThreats }
  }
  const side = knownSideCandidates
    ? {
        immediateWins: knownSideCandidates
          .filter((move) => move.immediateWin)
          .map(({ row, col }) => ({ row, col })),
        forcingMoves: knownSideCandidates
          .filter((move) => move.forcesReply || move.createsFourThree || move.createsDoubleThreat)
          .map(({ row, col }) => ({ row, col })),
        sameMoveMultiThreats: knownSideCandidates
          .filter((move) => move.createsFourThree || move.createsDoubleThreat)
          .map(({ row, col }) => ({ row, col })),
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
