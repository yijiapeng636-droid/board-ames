import { BOARD_SIZE, type Board, type Player } from '@/games/gomoku/types/gomoku'

export type ThreatPatternName =
  | 'five'
  | 'openFour'
  | 'closedFour'
  | 'openThree'
  | 'closedThree'
  | 'openTwo'

export interface ThreatPosition { row: number; col: number }
export type ThreatDirectionName = 'horizontal' | 'vertical' | 'diagonalDown' | 'diagonalUp'

export interface ThreatDirectionPattern {
  direction: ThreatDirectionName
  pattern: ThreatPatternName | null
  length: number
  openEnds: number
  stones: ThreatPosition[]
  openEndSquares: ThreatPosition[]
  key: string
}

export interface ThreatAnalysis {
  move: ThreatPosition
  player: Player
  winNow: boolean
  winningMoves: ThreatPosition[]
  openFours: ThreatDirectionPattern[]
  fours: ThreatDirectionPattern[]
  openThrees: ThreatDirectionPattern[]
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
  fours: ThreatDirectionPattern[]
  openThrees: ThreatDirectionPattern[]
  doubleThreat: boolean
  forcingContinuations: ThreatPosition[]
  defenseSquares: ThreatPosition[]
}

const DIRECTIONS: ReadonlyArray<{
  name: ThreatDirectionName
  rowStep: number
  colStep: number
}> = [
  { name: 'horizontal', rowStep: 0, colStep: 1 },
  { name: 'vertical', rowStep: 1, colStep: 0 },
  { name: 'diagonalDown', rowStep: 1, colStep: 1 },
  { name: 'diagonalUp', rowStep: 1, colStep: -1 },
]

function inBounds(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

function positionKey(position: ThreatPosition) {
  return `${position.row}:${position.col}`
}

function uniquePositions(positions: ThreatPosition[]) {
  const unique = new Map<string, ThreatPosition>()
  for (const position of positions) unique.set(positionKey(position), position)
  return [...unique.values()]
}

function classifyPattern(length: number, openEnds: number): ThreatPatternName | null {
  if (length >= 5) return 'five'
  if (length === 4 && openEnds === 2) return 'openFour'
  if (length === 4 && openEnds === 1) return 'closedFour'
  if (length === 3 && openEnds === 2) return 'openThree'
  if (length === 3 && openEnds === 1) return 'closedThree'
  if (length === 2 && openEnds === 2) return 'openTwo'
  return null
}

function analyzeDirection(
  board: Board,
  move: ThreatPosition,
  player: Player,
  direction: (typeof DIRECTIONS)[number],
): ThreatDirectionPattern {
  let startRow = move.row
  let startCol = move.col
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

  const before = { row: startRow - direction.rowStep, col: startCol - direction.colStep }
  const after = { row, col }
  const openEndSquares = [before, after].filter((position) =>
    inBounds(position.row, position.col) && board[position.row]?.[position.col] === 0,
  )
  const end = stones[stones.length - 1] ?? move
  return {
    direction: direction.name,
    pattern: classifyPattern(stones.length, openEndSquares.length),
    length: stones.length,
    openEnds: openEndSquares.length,
    stones,
    openEndSquares,
    key: `${direction.name}:${startRow}:${startCol}-${end.row}:${end.col}`,
  }
}

function directionsAt(board: Board, move: ThreatPosition, player: Player) {
  return DIRECTIONS.map((direction) => analyzeDirection(board, move, player, direction))
}

function wouldWin(board: Board, move: ThreatPosition, player: Player) {
  if (board[move.row]?.[move.col] !== 0) return false
  for (const direction of DIRECTIONS) {
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

function forcingSquares(
  winningMoves: ThreatPosition[],
  fours: ThreatDirectionPattern[],
  openThrees: ThreatDirectionPattern[],
) {
  return uniquePositions([
    ...winningMoves,
    ...fours.flatMap((line) => line.openEndSquares),
    ...openThrees.flatMap((line) => line.openEndSquares),
  ])
}

export function analyzeThreat(boardInput: Board, move: ThreatPosition, player: Player): ThreatAnalysis {
  if (!inBounds(move.row, move.col)) throw new Error('威胁分析落点越界')
  const occupied = boardInput[move.row]?.[move.col]
  if (occupied !== 0 && occupied !== player) throw new Error('威胁分析落点被对方棋子占用')
  const board = occupied === player ? boardInput : boardInput.map((line) => [...line])
  if (occupied === 0) board[move.row]![move.col] = player

  const directions = directionsAt(board, move, player)
  const openFours = directions.filter((line) => line.pattern === 'openFour')
  const fours = directions.filter((line) => line.pattern === 'openFour' || line.pattern === 'closedFour')
  const openThrees = directions.filter((line) => line.pattern === 'openThree')
  const winningMoves = directions.some((line) => line.pattern === 'five') ? [] : findWinningMoves(board, player)
  const forcingContinuations = forcingSquares(winningMoves, fours, openThrees)
  const forcingLineCount = fours.length + openThrees.length
  return {
    move: { ...move },
    player,
    winNow: directions.some((line) => line.pattern === 'five'),
    winningMoves,
    openFours,
    fours,
    openThrees,
    doubleThreat: forcingLineCount >= 2,
    fourThree: fours.length > 0 && openThrees.length > 0,
    forcingContinuations,
    defenseSquares: [...forcingContinuations],
    directions,
  }
}

export function analyzeBoardThreat(board: Board, player: Player): BoardThreatAnalysis {
  const lines = new Map<string, ThreatDirectionPattern>()
  let doubleThreat = false
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row]?.[col] !== player) continue
      const local = directionsAt(board, { row, col }, player)
      const localFours = local.filter((line) => line.pattern === 'openFour' || line.pattern === 'closedFour')
      const localOpenThrees = local.filter((line) => line.pattern === 'openThree')
      if (localFours.length + localOpenThrees.length >= 2) doubleThreat = true
      for (const line of local) if (line.pattern) lines.set(line.key, line)
    }
  }
  const unique = [...lines.values()]
  const winningMoves = findWinningMoves(board, player)
  const fives = unique.filter((line) => line.pattern === 'five')
  const openFours = unique.filter((line) => line.pattern === 'openFour')
  const fours = unique.filter((line) => line.pattern === 'openFour' || line.pattern === 'closedFour')
  const openThrees = unique.filter((line) => line.pattern === 'openThree')
  const forcingContinuations = forcingSquares(winningMoves, fours, openThrees)
  return {
    player,
    lines: unique,
    winningMoves,
    fives,
    openFours,
    fours,
    openThrees,
    doubleThreat,
    forcingContinuations,
    defenseSquares: [...forcingContinuations],
  }
}
