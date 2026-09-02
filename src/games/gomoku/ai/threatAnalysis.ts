import { BOARD_SIZE, type Board, type Player } from '@/games/gomoku/types/gomoku'
import {
  GOMOKU_DIRECTIONS,
  scanThreatDirection,
  scanThreatDirections,
} from './threatPatternScanner'

export type ThreatPatternName =
  | 'five'
  | 'openFour'
  | 'closedFour'
  | 'brokenFour'
  | 'openThree'
  | 'brokenThree'
  | 'closedThree'
  | 'openTwo'

export interface ThreatPosition {
  row: number
  col: number
}

export type ThreatDirectionName =
  | 'horizontal'
  | 'vertical'
  | 'diagonalDown'
  | 'diagonalUp'

export interface ThreatDirectionPattern {
  direction: ThreatDirectionName
  pattern: ThreatPatternName | null
  length: number
  openEnds: number
  stones: ThreatPosition[]
  openEndSquares: ThreatPosition[]
  winningMoves: ThreatPosition[]
  continuationSquares: ThreatPosition[]
  defenseSquares: ThreatPosition[]
  broken: boolean
  key: string
}

export interface ThreatAnalysisOptions {
  includeDefenseSquares?: boolean
}

export interface ThreatAnalysis {
  move: ThreatPosition
  player: Player
  winNow: boolean
  winningMoves: ThreatPosition[]
  openFours: ThreatDirectionPattern[]
  brokenFours: ThreatDirectionPattern[]
  fours: ThreatDirectionPattern[]
  openThrees: ThreatDirectionPattern[]
  brokenThrees: ThreatDirectionPattern[]
  threeThreats: ThreatDirectionPattern[]
  doubleThreat: boolean
  fourThree: boolean
  forcingContinuations: ThreatPosition[]
  defenseSquares: ThreatPosition[]
  directions: ThreatDirectionPattern[]
}

export interface BoardThreatAnalysis {
  player: Player
  lines: ThreatDirectionPattern[]
  winningMoves: ThreatPosition[]
  fives: ThreatDirectionPattern[]
  openFours: ThreatDirectionPattern[]
  brokenFours: ThreatDirectionPattern[]
  fours: ThreatDirectionPattern[]
  openThrees: ThreatDirectionPattern[]
  brokenThrees: ThreatDirectionPattern[]
  threeThreats: ThreatDirectionPattern[]
  doubleThreat: boolean
  forcingContinuations: ThreatPosition[]
  defenseSquares: ThreatPosition[]
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

function positionKey(position: ThreatPosition): string {
  return `${position.row}:${position.col}`
}

function uniquePositions(positions: readonly ThreatPosition[]): ThreatPosition[] {
  const unique = new Map<string, ThreatPosition>()
  for (const position of positions) unique.set(positionKey(position), { ...position })
  return [...unique.values()]
}

function wouldWin(board: Board, move: ThreatPosition, player: Player): boolean {
  if (board[move.row]?.[move.col] !== 0) return false

  for (const direction of GOMOKU_DIRECTIONS) {
    let length = 1

    for (const sign of [-1, 1] as const) {
      let row = move.row + direction.rowStep * sign
      let col = move.col + direction.colStep * sign

      while (board[row]?.[col] === player) {
        length += 1
        row += direction.rowStep * sign
        col += direction.colStep * sign
      }
    }

    if (length >= 5) return true
  }

  return false
}

export function findWinningMoves(board: Board, player: Player): ThreatPosition[] {
  const moves: ThreatPosition[] = []

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const move = { row, col }
      if (wouldWin(board, move, player)) moves.push(move)
    }
  }

  return moves
}

function isFour(line: ThreatDirectionPattern): boolean {
  return (
    line.pattern === 'openFour' ||
    line.pattern === 'closedFour' ||
    line.pattern === 'brokenFour'
  )
}

function isThreeThreat(line: ThreatDirectionPattern): boolean {
  return line.pattern === 'openThree' || line.pattern === 'brokenThree'
}

function forcingSquares(
  winningMoves: readonly ThreatPosition[],
  fours: readonly ThreatDirectionPattern[],
  threeThreats: readonly ThreatDirectionPattern[],
): ThreatPosition[] {
  return uniquePositions([
    ...winningMoves,
    ...fours.flatMap((line) => line.winningMoves),
    ...threeThreats.flatMap((line) => line.continuationSquares),
  ])
}

function defensiveSquares(
  winningMoves: readonly ThreatPosition[],
  fours: readonly ThreatDirectionPattern[],
  threeThreats: readonly ThreatDirectionPattern[],
): ThreatPosition[] {
  return uniquePositions([
    ...winningMoves,
    ...fours.flatMap((line) => line.defenseSquares),
    ...threeThreats.flatMap((line) => line.defenseSquares),
  ])
}

function summarizeThreatLines(
  directions: ThreatDirectionPattern[],
  winningMoves: ThreatPosition[],
) {
  const openFours = directions.filter((line) => line.pattern === 'openFour')
  const brokenFours = directions.filter((line) => line.pattern === 'brokenFour')
  const fours = directions.filter(isFour)
  const openThrees = directions.filter((line) => line.pattern === 'openThree')
  const brokenThrees = directions.filter((line) => line.pattern === 'brokenThree')
  const threeThreats = directions.filter(isThreeThreat)

  return {
    openFours,
    brokenFours,
    fours,
    openThrees,
    brokenThrees,
    threeThreats,
    forcingContinuations: forcingSquares(winningMoves, fours, threeThreats),
    defenseSquares: defensiveSquares(winningMoves, fours, threeThreats),
  }
}

export function analyzeThreat(
  boardInput: Board,
  move: ThreatPosition,
  player: Player,
  options: ThreatAnalysisOptions = {},
): ThreatAnalysis {
  if (!inBounds(move.row, move.col)) throw new Error('威胁分析落点越界')

  const occupied = boardInput[move.row]?.[move.col]
  if (occupied !== 0 && occupied !== player) {
    throw new Error('威胁分析落点被对方棋子占用')
  }

  const board =
    occupied === player ? boardInput : boardInput.map((line) => [...line])
  if (occupied === 0) board[move.row]![move.col] = player

  const directions = scanThreatDirections(
    board,
    move,
    player,
    options.includeDefenseSquares ?? true,
  )
  const winNow = directions.some((line) => line.pattern === 'five')
  const winningMoves = winNow
    ? []
    : uniquePositions(directions.flatMap((line) => line.winningMoves))
  const summary = summarizeThreatLines(directions, winningMoves)
  const forcingLineCount = summary.fours.length + summary.threeThreats.length

  return {
    move: { ...move },
    player,
    winNow,
    winningMoves,
    ...summary,
    doubleThreat: forcingLineCount >= 2,
    fourThree: summary.fours.length > 0 && summary.threeThreats.length > 0,
    directions,
  }
}

export function analyzeBoardThreat(
  board: Board,
  player: Player,
  options: ThreatAnalysisOptions = {},
): BoardThreatAnalysis {
  const lines = new Map<string, { line: ThreatDirectionPattern; anchor: ThreatPosition }>()
  let doubleThreat = false

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row]?.[col] !== player) continue

      const local = scanThreatDirections(
        board,
        { row, col },
        player,
        false,
      )
      const localFours = local.filter(isFour)
      const localThreeThreats = local.filter(isThreeThreat)

      if (localFours.length + localThreeThreats.length >= 2) {
        doubleThreat = true
      }

      for (const line of local) {
        if (line.pattern && !lines.has(line.key)) {
          lines.set(line.key, { line, anchor: { row, col } })
        }
      }
    }
  }

  const includeDefenseSquares = options.includeDefenseSquares ?? true
  const unique = [...lines.values()].map(({ line, anchor }) => {
    if (!includeDefenseSquares || !isThreeThreat(line)) return line
    const direction = GOMOKU_DIRECTIONS.find((item) => item.name === line.direction)!
    return scanThreatDirection(board, anchor, player, direction, true)
  })
  const winningMoves = findWinningMoves(board, player)
  const summary = summarizeThreatLines(unique, winningMoves)

  return {
    player,
    lines: unique,
    winningMoves,
    fives: unique.filter((line) => line.pattern === 'five'),
    ...summary,
    doubleThreat,
  }
}
