import { PATTERN_SCORES, SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import {
  analyzeThreat,
  type ThreatDirectionPattern,
  type ThreatPatternName,
} from '@/games/gomoku/ai/threatAnalysis'
import {
  BOARD_CENTER,
  BOARD_LAST_INDEX,
  BOARD_SIZE,
  type AICandidate,
  type Board,
  type Player,
} from '@/games/gomoku/types/gomoku'

export type PatternName = ThreatPatternName
export type DirectionPattern = Pick<ThreatDirectionPattern, 'pattern' | 'length' | 'openEnds'>

export function analyzeMovePatterns(
  board: Board,
  row: number,
  col: number,
  player: Player,
): DirectionPattern[] {
  if (board[row]?.[col] !== 0) return []
  return analyzeThreat(board, { row, col }, player).directions.map(
    ({ pattern, length, openEnds }) => ({
      pattern,
      length,
      openEnds,
    }),
  )
}

function summarizePatterns(patterns: DirectionPattern[]) {
  const names = patterns.flatMap(({ pattern }) => (pattern ? [pattern] : []))
  const fourCount = names.filter((name) =>
    ['openFour', 'closedFour', 'brokenFour'].includes(name),
  ).length
  const threeCount = names.filter((name) => ['openThree', 'brokenThree'].includes(name)).length
  return {
    names,
    score: names.reduce((total, name) => total + PATTERN_SCORES[name], 0),
    doubleThreat: fourCount + threeCount >= 2,
    fourThree: fourCount >= 1 && threeCount >= 1,
  }
}

export function getNearbyEmptyCells(board: Board) {
  const nearby = Array.from({ length: BOARD_SIZE }, () => Array<boolean>(BOARD_SIZE).fill(false))
  let hasPiece = false
  const radius = SEARCH_CONFIG.candidateRadius
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!board[row]?.[col]) continue
      hasPiece = true
      for (
        let nearbyRow = Math.max(0, row - radius);
        nearbyRow <= Math.min(BOARD_LAST_INDEX, row + radius);
        nearbyRow += 1
      ) {
        for (
          let nearbyCol = Math.max(0, col - radius);
          nearbyCol <= Math.min(BOARD_LAST_INDEX, col + radius);
          nearbyCol += 1
        ) {
          nearby[nearbyRow]![nearbyCol] = true
        }
      }
    }
  }
  if (!hasPiece) return [{ row: BOARD_CENTER, col: BOARD_CENTER }]

  const cells: Array<{ row: number; col: number }> = []
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (nearby[row]?.[col] && board[row]?.[col] === 0) cells.push({ row, col })
    }
  }
  return cells
}

export function evaluateCandidate(
  board: Board,
  row: number,
  col: number,
  player: Player,
): AICandidate {
  const opponent: Player = player === 1 ? 2 : 1
  const attackThreat = analyzeThreat(board, { row, col }, player, { includeDefenseSquares: false })
  const defenseThreat = analyzeThreat(board, { row, col }, opponent, {
    includeDefenseSquares: false,
  })
  const attack = summarizePatterns(attackThreat.directions)
  const defense = summarizePatterns(defenseThreat.directions)
  const features = new Set<string>(attack.names)
  for (const name of defense.names) features.add(`block${name[0]!.toUpperCase()}${name.slice(1)}`)
  if (attackThreat.doubleThreat) features.add('doubleThreat')
  if (attackThreat.fourThree) features.add('fourThree')

  let adjacentPieces = 0
  for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
    for (let colStep = -1; colStep <= 1; colStep += 1) {
      if ((rowStep !== 0 || colStep !== 0) && board[row + rowStep]?.[col + colStep])
        adjacentPieces += 1
    }
  }
  const centerBonus =
    BOARD_LAST_INDEX - (Math.abs(row - BOARD_CENTER) + Math.abs(col - BOARD_CENTER))
  const positionalScore = adjacentPieces * 25 + centerBonus
  let orderingScore = attack.score + defense.score * 1.15 + positionalScore
  if (attackThreat.doubleThreat) orderingScore += 120_000
  if (attackThreat.fourThree) orderingScore += 180_000
  if (attackThreat.winNow) orderingScore += 2_000_000
  else if (defenseThreat.winNow) orderingScore += 1_500_000
  if (features.size === 0) features.add('positional')
  const immediateWin = attackThreat.winNow
  const blocksImmediateWin = defenseThreat.winNow
  const createsDoubleThreat = attackThreat.doubleThreat
  const createsFourThree = attackThreat.fourThree
  const forcesReply = immediateWin || attackThreat.fours.length > 0
  const pureDefense =
    blocksImmediateWin &&
    !immediateWin &&
    !createsDoubleThreat &&
    !createsFourThree &&
    !attack.names.some((name) =>
      ['openFour', 'closedFour', 'brokenFour', 'openThree', 'brokenThree'].includes(name),
    )
  return {
    row,
    col,
    attackScore: attack.score,
    defenseScore: defense.score,
    positionalScore,
    orderingScore: Math.round(orderingScore),
    attackPatterns: [...attack.names],
    defensePatterns: [...defense.names],
    immediateWin,
    blocksImmediateWin,
    createsDoubleThreat,
    createsFourThree,
    forcesReply,
    pureDefense,
    score: Math.round(orderingScore),
    features: [...features],
  }
}

function isProtected(candidate: AICandidate) {
  const protectedFeatures = [
    'five',
    'blockFive',
    'openFour',
    'blockOpenFour',
    'closedFour',
    'blockClosedFour',
    'brokenFour',
    'blockBrokenFour',
    'doubleThreat',
    'fourThree',
  ]
  return candidate.features.some((feature) => protectedFeatures.includes(feature))
}

export function generateCandidatePool(
  board: Board,
  player: Player = 2,
  limit: number = SEARCH_CONFIG.candidatePoolLimit,
): AICandidate[] {
  const sorted = getNearbyEmptyCells(board)
    .map(({ row, col }) => evaluateCandidate(board, row, col, player))
    .sort(
      (left, right) =>
        right.orderingScore - left.orderingScore ||
        Math.abs(left.row - BOARD_CENTER) +
          Math.abs(left.col - BOARD_CENTER) -
          (Math.abs(right.row - BOARD_CENTER) + Math.abs(right.col - BOARD_CENTER)) ||
        left.row - right.row ||
        left.col - right.col,
    )
  const selected = sorted.filter(isProtected)
  for (const candidate of sorted) {
    if (selected.length >= limit) break
    if (!selected.includes(candidate)) selected.push(candidate)
  }
  return selected
}
