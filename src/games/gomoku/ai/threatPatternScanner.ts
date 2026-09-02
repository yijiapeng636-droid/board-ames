import { BOARD_SIZE, type Board, type Player } from '@/games/gomoku/types/gomoku'
import type {
  ThreatDirectionName,
  ThreatDirectionPattern,
  ThreatPatternName,
  ThreatPosition,
} from './threatAnalysis'

export interface DirectionStep {
  name: ThreatDirectionName
  rowStep: number
  colStep: number
}

interface ContiguousLine {
  stones: ThreatPosition[]
  openEndSquares: ThreatPosition[]
}

export const GOMOKU_DIRECTIONS: readonly DirectionStep[] = [
  { name: 'horizontal', rowStep: 0, colStep: 1 },
  { name: 'vertical', rowStep: 1, colStep: 0 },
  { name: 'diagonalDown', rowStep: 1, colStep: 1 },
  { name: 'diagonalUp', rowStep: 1, colStep: -1 },
]

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

function samePosition(left: ThreatPosition, right: ThreatPosition): boolean {
  return left.row === right.row && left.col === right.col
}

function positionKey(position: ThreatPosition): string {
  return `${position.row}:${position.col}`
}

function uniquePositions(positions: readonly ThreatPosition[]): ThreatPosition[] {
  const unique = new Map<string, ThreatPosition>()
  for (const position of positions) unique.set(positionKey(position), { ...position })
  return [...unique.values()]
}

function sortedPositionKeys(positions: readonly ThreatPosition[]): string {
  return [...positions]
    .sort((left, right) => left.row - right.row || left.col - right.col)
    .map(positionKey)
    .join(',')
}

function linePositions(anchor: ThreatPosition, direction: DirectionStep): ThreatPosition[] {
  let row = anchor.row
  let col = anchor.col

  while (inBounds(row - direction.rowStep, col - direction.colStep)) {
    row -= direction.rowStep
    col -= direction.colStep
  }

  const positions: ThreatPosition[] = []
  while (inBounds(row, col)) {
    positions.push({ row, col })
    row += direction.rowStep
    col += direction.colStep
  }
  return positions
}

function windowsContainingAnchor(
  positions: readonly ThreatPosition[],
  anchor: ThreatPosition,
): ThreatPosition[][] {
  const anchorIndex = positions.findIndex((position) => samePosition(position, anchor))
  if (anchorIndex < 0) return []

  const firstStart = Math.max(0, anchorIndex - 4)
  const lastStart = Math.min(anchorIndex, positions.length - 5)
  const windows: ThreatPosition[][] = []

  for (let start = firstStart; start <= lastStart; start += 1) {
    windows.push(positions.slice(start, start + 5))
  }
  return windows
}

function relevantPositions(
  positions: readonly ThreatPosition[],
  anchor: ThreatPosition,
): ThreatPosition[] {
  return uniquePositions(windowsContainingAnchor(positions, anchor).flat())
}

function contiguousLine(
  board: Board,
  anchor: ThreatPosition,
  player: Player,
  direction: DirectionStep,
): ContiguousLine {
  let startRow = anchor.row
  let startCol = anchor.col

  while (board[startRow - direction.rowStep]?.[startCol - direction.colStep] === player) {
    startRow -= direction.rowStep
    startCol -= direction.colStep
  }

  const stones: ThreatPosition[] = []
  let row = startRow
  let col = startCol

  while (board[row]?.[col] === player) {
    stones.push({ row, col })
    row += direction.rowStep
    col += direction.colStep
  }

  const before = {
    row: startRow - direction.rowStep,
    col: startCol - direction.colStep,
  }
  const after = { row, col }
  const openEndSquares = [before, after].filter(
    (position) =>
      inBounds(position.row, position.col) &&
      board[position.row]?.[position.col] === 0,
  )

  return { stones, openEndSquares }
}

function playerCount(
  board: Board,
  window: readonly ThreatPosition[],
  player: Player,
): number {
  return window.reduce(
    (count, position) => count + Number(board[position.row]?.[position.col] === player),
    0,
  )
}

function hasOpponent(
  board: Board,
  window: readonly ThreatPosition[],
  player: Player,
): boolean {
  return window.some((position) => {
    const piece = board[position.row]?.[position.col]
    return piece !== 0 && piece !== player
  })
}

function emptySquares(board: Board, window: readonly ThreatPosition[]): ThreatPosition[] {
  return window.filter((position) => board[position.row]?.[position.col] === 0)
}

function hasFive(
  board: Board,
  anchor: ThreatPosition,
  player: Player,
  positions: readonly ThreatPosition[],
): boolean {
  return windowsContainingAnchor(positions, anchor).some(
    (window) => playerCount(board, window, player) === 5,
  )
}

function winningMoves(
  board: Board,
  anchor: ThreatPosition,
  player: Player,
  positions: readonly ThreatPosition[],
): ThreatPosition[] {
  const result: ThreatPosition[] = []

  for (const window of windowsContainingAnchor(positions, anchor)) {
    if (hasOpponent(board, window, player) || playerCount(board, window, player) !== 4) {
      continue
    }
    const empty = emptySquares(board, window)
    if (empty.length === 1) result.push(empty[0]!)
  }

  return uniquePositions(result)
}

function openFourContinuations(
  board: Board,
  anchor: ThreatPosition,
  player: Player,
  positions: readonly ThreatPosition[],
): ThreatPosition[] {
  const continuations: ThreatPosition[] = []
  const candidates = uniquePositions(
    windowsContainingAnchor(positions, anchor)
      .filter(
        (window) =>
          !hasOpponent(board, window, player) &&
          playerCount(board, window, player) === 3,
      )
      .flatMap((window) => emptySquares(board, window)),
  )

  for (const candidate of candidates) {
    board[candidate.row]![candidate.col] = player
    const futureWins = winningMoves(board, anchor, player, positions)
    board[candidate.row]![candidate.col] = 0

    if (futureWins.length >= 2) continuations.push(candidate)
  }

  return uniquePositions(continuations)
}

function threeDefenseSquares(
  board: Board,
  anchor: ThreatPosition,
  player: Player,
  positions: readonly ThreatPosition[],
): ThreatPosition[] {
  const defender: Player = player === 1 ? 2 : 1
  const defenses: ThreatPosition[] = []

  for (const candidate of relevantPositions(positions, anchor)) {
    if (board[candidate.row]?.[candidate.col] !== 0) continue

    board[candidate.row]![candidate.col] = defender
    const remainingWins = winningMoves(board, anchor, player, positions)
    const remainingOpenFourContinuations = openFourContinuations(
      board,
      anchor,
      player,
      positions,
    )
    board[candidate.row]![candidate.col] = 0

    if (remainingWins.length === 0 && remainingOpenFourContinuations.length === 0) {
      defenses.push(candidate)
    }
  }

  return uniquePositions(defenses)
}

function supportStones(
  board: Board,
  anchor: ThreatPosition,
  player: Player,
  positions: readonly ThreatPosition[],
  currentWinningMoves: readonly ThreatPosition[],
  continuationSquares: readonly ThreatPosition[],
  contiguous: ContiguousLine,
): ThreatPosition[] {
  if (currentWinningMoves.length > 0) {
    const winningKeys = new Set(currentWinningMoves.map(positionKey))
    for (const window of windowsContainingAnchor(positions, anchor)) {
      if (hasOpponent(board, window, player) || playerCount(board, window, player) !== 4) {
        continue
      }
      const empty = emptySquares(board, window)
      if (empty.length === 1 && winningKeys.has(positionKey(empty[0]!))) {
        return window.filter((position) => board[position.row]?.[position.col] === player)
      }
    }
  }

  const continuation = continuationSquares[0]
  if (!continuation) return contiguous.stones

  board[continuation.row]![continuation.col] = player
  const futureWinningKeys = new Set(
    winningMoves(board, anchor, player, positions).map(positionKey),
  )

  for (const window of windowsContainingAnchor(positions, anchor)) {
    if (hasOpponent(board, window, player) || playerCount(board, window, player) !== 4) {
      continue
    }

    const empty = emptySquares(board, window)
    if (empty.length !== 1 || !futureWinningKeys.has(positionKey(empty[0]!))) continue

    const support = window.filter(
      (position) =>
        !samePosition(position, continuation) &&
        board[position.row]?.[position.col] === player,
    )
    board[continuation.row]![continuation.col] = 0
    return support
  }

  board[continuation.row]![continuation.col] = 0
  return contiguous.stones
}

function residualPattern(
  contiguousLength: number,
  openEnds: number,
  lineLength: number,
): ThreatPatternName | null {
  if (lineLength < 5) return null
  if (contiguousLength === 3 && openEnds === 1) return 'closedThree'
  if (contiguousLength === 2 && openEnds === 2) return 'openTwo'
  return null
}

function patternKey(
  direction: DirectionStep,
  pattern: ThreatPatternName | null,
  stones: readonly ThreatPosition[],
  currentWinningMoves: readonly ThreatPosition[],
  continuationSquares: readonly ThreatPosition[],
): string {
  return [
    direction.name,
    pattern ?? 'none',
    `stones=${sortedPositionKeys(stones)}`,
    `wins=${sortedPositionKeys(currentWinningMoves)}`,
    `next=${sortedPositionKeys(continuationSquares)}`,
  ].join(':')
}

export function scanThreatDirection(
  board: Board,
  move: ThreatPosition,
  player: Player,
  direction: DirectionStep,
  includeDefenseSquares: boolean,
): ThreatDirectionPattern {
  const positions = linePositions(move, direction)
  const contiguous = contiguousLine(board, move, player, direction)
  const winNow = hasFive(board, move, player, positions)
  const currentWinningMoves = winNow ? [] : winningMoves(board, move, player, positions)
  const continuationSquares =
    !winNow && currentWinningMoves.length === 0
      ? openFourContinuations(board, move, player, positions)
      : []

  let pattern: ThreatPatternName | null
  if (winNow) pattern = 'five'
  else if (currentWinningMoves.length >= 2) pattern = 'openFour'
  else if (currentWinningMoves.length === 1) {
    pattern = contiguous.stones.length === 4 ? 'closedFour' : 'brokenFour'
  } else if (continuationSquares.length > 0) {
    pattern =
      contiguous.stones.length === 3 && contiguous.openEndSquares.length === 2
        ? 'openThree'
        : 'brokenThree'
  } else {
    pattern = residualPattern(
      contiguous.stones.length,
      contiguous.openEndSquares.length,
      positions.length,
    )
  }

  const defenses =
    pattern === 'openFour' || pattern === 'closedFour' || pattern === 'brokenFour'
      ? [...currentWinningMoves]
      : includeDefenseSquares &&
          (pattern === 'openThree' || pattern === 'brokenThree')
        ? threeDefenseSquares(board, move, player, positions)
        : []

  const stones = supportStones(
    board,
    move,
    player,
    positions,
    currentWinningMoves,
    continuationSquares,
    contiguous,
  )

  return {
    direction: direction.name,
    pattern,
    length:
      pattern === 'brokenFour'
        ? 4
        : pattern === 'brokenThree'
          ? 3
          : contiguous.stones.length,
    openEnds: contiguous.openEndSquares.length,
    stones,
    openEndSquares: contiguous.openEndSquares,
    winningMoves: currentWinningMoves,
    continuationSquares,
    defenseSquares: defenses,
    broken: pattern === 'brokenFour' || pattern === 'brokenThree',
    key: patternKey(direction, pattern, stones, currentWinningMoves, continuationSquares),
  }
}

export function scanThreatDirections(
  board: Board,
  move: ThreatPosition,
  player: Player,
  includeDefenseSquares: boolean,
): ThreatDirectionPattern[] {
  return GOMOKU_DIRECTIONS.map((direction) =>
    scanThreatDirection(board, move, player, direction, includeDefenseSquares),
  )
}
