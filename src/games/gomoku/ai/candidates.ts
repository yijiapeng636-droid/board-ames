import { SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import { BOARD_SIZE, type AICandidate, type Board, type Player } from '@/games/gomoku/types/gomoku'

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

export type PatternName =
  'five' | 'openFour' | 'closedFour' | 'openThree' | 'closedThree' | 'openTwo'

export interface DirectionPattern {
  pattern: PatternName | null
  length: number
  openEnds: number
}

const PATTERN_SCORES: Record<PatternName, number> = {
  five: 1_000_000,
  openFour: 100_000,
  closedFour: 30_000,
  openThree: 8_000,
  closedThree: 1_200,
  openTwo: 400,
}

function scan(
  board: Board,
  row: number,
  col: number,
  rowStep: number,
  colStep: number,
  player: Player,
) {
  let length = 0
  let currentRow = row + rowStep
  let currentCol = col + colStep
  while (board[currentRow]?.[currentCol] === player) {
    length += 1
    currentRow += rowStep
    currentCol += colStep
  }
  return { length, open: board[currentRow]?.[currentCol] === 0 }
}

function classifyPattern(length: number, openEnds: number): PatternName | null {
  if (length >= 5) return 'five'
  if (length === 4 && openEnds === 2) return 'openFour'
  if (length === 4 && openEnds === 1) return 'closedFour'
  if (length === 3 && openEnds === 2) return 'openThree'
  if (length === 3 && openEnds === 1) return 'closedThree'
  if (length === 2 && openEnds === 2) return 'openTwo'
  return null
}

export function analyzeMovePatterns(
  board: Board,
  row: number,
  col: number,
  player: Player,
): DirectionPattern[] {
  if (board[row]?.[col] !== 0) return []
  return DIRECTIONS.map(([rowStep, colStep]) => {
    const forward = scan(board, row, col, rowStep, colStep, player)
    const backward = scan(board, row, col, -rowStep, -colStep, player)
    const length = forward.length + backward.length + 1
    const openEnds = Number(forward.open) + Number(backward.open)
    return { pattern: classifyPattern(length, openEnds), length, openEnds }
  })
}

function summarizePatterns(patterns: DirectionPattern[]) {
  const names = patterns.flatMap(({ pattern }) => (pattern ? [pattern] : []))
  const fourCount = names.filter((name) => name === 'openFour' || name === 'closedFour').length
  const threeCount = names.filter((name) => name === 'openThree').length
  return {
    names,
    score: names.reduce((total, name) => total + PATTERN_SCORES[name], 0),
    doubleThreat: fourCount + threeCount >= 2,
    fourThree: fourCount >= 1 && threeCount >= 1,
  }
}

export function getNearbyEmptyCells(board: Board) {
  const occupied: Array<[number, number]> = []
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row]?.[col]) occupied.push([row, col])
    }
  }
  if (occupied.length === 0) return [{ row: 7, col: 7 }]

  const cells = new Map<string, { row: number; col: number }>()
  const radius = SEARCH_CONFIG.candidateRadius
  for (const [pieceRow, pieceCol] of occupied) {
    for (
      let row = Math.max(0, pieceRow - radius);
      row <= Math.min(14, pieceRow + radius);
      row += 1
    ) {
      for (
        let col = Math.max(0, pieceCol - radius);
        col <= Math.min(14, pieceCol + radius);
        col += 1
      ) {
        if (board[row]?.[col] === 0) cells.set(`${row}-${col}`, { row, col })
      }
    }
  }
  return [...cells.values()]
}

export function evaluateCandidate(
  board: Board,
  row: number,
  col: number,
  player: Player,
): AICandidate {
  const opponent: Player = player === 1 ? 2 : 1
  const attack = summarizePatterns(analyzeMovePatterns(board, row, col, player))
  const defense = summarizePatterns(analyzeMovePatterns(board, row, col, opponent))
  const features = new Set<string>(attack.names)
  for (const name of defense.names) features.add(`block${name[0]!.toUpperCase()}${name.slice(1)}`)
  if (attack.doubleThreat) features.add('doubleThreat')
  if (attack.fourThree) features.add('fourThree')

  let adjacentPieces = 0
  for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
    for (let colStep = -1; colStep <= 1; colStep += 1) {
      if ((rowStep !== 0 || colStep !== 0) && board[row + rowStep]?.[col + colStep])
        adjacentPieces += 1
    }
  }
  const centerBonus = 14 - (Math.abs(row - 7) + Math.abs(col - 7))
  const positionalScore = adjacentPieces * 25 + centerBonus
  let orderingScore = attack.score + defense.score * 1.15 + positionalScore
  if (attack.doubleThreat) orderingScore += 120_000
  if (attack.fourThree) orderingScore += 180_000
  if (attack.names.includes('five')) orderingScore += 2_000_000
  else if (defense.names.includes('five')) orderingScore += 1_500_000
  if (features.size === 0) features.add('positional')
  const immediateWin = attack.names.includes('five')
  const blocksImmediateWin = defense.names.includes('five')
  const createsDoubleThreat = attack.doubleThreat
  const createsFourThree = attack.fourThree
  const forcesReply = immediateWin || attack.names.some((name) => name === 'openFour' || name === 'closedFour')
  const pureDefense =
    blocksImmediateWin &&
    !immediateWin &&
    !createsDoubleThreat &&
    !createsFourThree &&
    !attack.names.some((name) => ['openFour', 'closedFour', 'openThree'].includes(name))
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
        Math.abs(left.row - 7) +
          Math.abs(left.col - 7) -
          (Math.abs(right.row - 7) + Math.abs(right.col - 7)) ||
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

export function generateCandidates(board: Board, limit: number = 10): AICandidate[] {
  return generateCandidatePool(board, 2, limit)
}

export function getForcedCandidate(candidates: AICandidate[]): AICandidate | null {
  return (
    candidates.find((candidate) => candidate.features.includes('five')) ??
    candidates.find((candidate) => candidate.features.includes('blockFive')) ??
    null
  )
}

export function findForcedTacticalMove(candidates: AICandidate[]): AICandidate | null {
  // Strong patterns are search inputs until Threat Search proves every best defense loses.
  return candidates.find((candidate) => candidate.immediateWin) ?? null
}
