import {
  XIANGQI_COLS,
  XIANGQI_ROWS,
  type XiangqiBoard,
  type XiangqiPiece,
  type XiangqiPosition,
} from '@/games/xiangqi/types/xiangqi'

type MoveGenerator = (
  board: XiangqiBoard,
  from: XiangqiPosition,
  piece: XiangqiPiece,
) => XiangqiPosition[]

interface Step {
  row: number
  col: number
}

const ORTHOGONAL_DIRECTIONS: Step[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
]

const HORSE_STEPS: Array<{ move: Step; leg: Step }> = [
  { move: { row: -2, col: -1 }, leg: { row: -1, col: 0 } },
  { move: { row: -2, col: 1 }, leg: { row: -1, col: 0 } },
  { move: { row: 2, col: -1 }, leg: { row: 1, col: 0 } },
  { move: { row: 2, col: 1 }, leg: { row: 1, col: 0 } },
  { move: { row: -1, col: -2 }, leg: { row: 0, col: -1 } },
  { move: { row: 1, col: -2 }, leg: { row: 0, col: -1 } },
  { move: { row: -1, col: 2 }, leg: { row: 0, col: 1 } },
  { move: { row: 1, col: 2 }, leg: { row: 0, col: 1 } },
]

const ELEPHANT_STEPS: Array<{ move: Step; eye: Step }> = [
  { move: { row: -2, col: -2 }, eye: { row: -1, col: -1 } },
  { move: { row: -2, col: 2 }, eye: { row: -1, col: 1 } },
  { move: { row: 2, col: -2 }, eye: { row: 1, col: -1 } },
  { move: { row: 2, col: 2 }, eye: { row: 1, col: 1 } },
]

function isInside(position: XiangqiPosition): boolean {
  return (
    position.row >= 0 &&
    position.row < XIANGQI_ROWS &&
    position.col >= 0 &&
    position.col < XIANGQI_COLS
  )
}

function occupant(board: XiangqiBoard, position: XiangqiPosition) {
  return board[position.row]?.[position.col]
}

function canLand(board: XiangqiBoard, position: XiangqiPosition, piece: XiangqiPiece): boolean {
  return isInside(position) && occupant(board, position)?.side !== piece.side
}

function collectSlidingMoves(
  board: XiangqiBoard,
  from: XiangqiPosition,
  piece: XiangqiPiece,
  direction: Step,
): XiangqiPosition[] {
  const moves: XiangqiPosition[] = []
  let row = from.row + direction.row
  let col = from.col + direction.col

  while (isInside({ row, col })) {
    const target = board[row]?.[col]
    if (!target) {
      moves.push({ row, col })
    } else {
      if (target.side !== piece.side) moves.push({ row, col })
      break
    }
    row += direction.row
    col += direction.col
  }
  return moves
}

export const generateRookMoves: MoveGenerator = (board, from, piece) =>
  ORTHOGONAL_DIRECTIONS.flatMap((direction) =>
    collectSlidingMoves(board, from, piece, direction),
  )

export const generateHorseMoves: MoveGenerator = (board, from, piece) =>
  HORSE_STEPS.flatMap(({ move, leg }) => {
    const legPosition = { row: from.row + leg.row, col: from.col + leg.col }
    const target = { row: from.row + move.row, col: from.col + move.col }
    return !occupant(board, legPosition) && canLand(board, target, piece) ? [target] : []
  })

export const generateCannonMoves: MoveGenerator = (board, from, piece) => {
  const moves: XiangqiPosition[] = []

  for (const direction of ORTHOGONAL_DIRECTIONS) {
    let row = from.row + direction.row
    let col = from.col + direction.col
    let hasScreen = false

    while (isInside({ row, col })) {
      const target = board[row]?.[col]
      if (!hasScreen) {
        if (target) {
          hasScreen = true
        } else {
          moves.push({ row, col })
        }
      } else if (target) {
        if (target.side !== piece.side) moves.push({ row, col })
        break
      }
      row += direction.row
      col += direction.col
    }
  }

  return moves
}

export const generateElephantMoves: MoveGenerator = (board, from, piece) =>
  ELEPHANT_STEPS.flatMap(({ move, eye }) => {
    const eyePosition = { row: from.row + eye.row, col: from.col + eye.col }
    const target = { row: from.row + move.row, col: from.col + move.col }
    const staysOnOwnSide = piece.side === 'red' ? target.row >= 5 : target.row <= 4
    return !occupant(board, eyePosition) && staysOnOwnSide && canLand(board, target, piece)
      ? [target]
      : []
  })

function isInPalace(position: XiangqiPosition, piece: XiangqiPiece): boolean {
  const inColumns = position.col >= 3 && position.col <= 5
  const inRows =
    piece.side === 'red'
      ? position.row >= 7 && position.row <= 9
      : position.row >= 0 && position.row <= 2
  return inColumns && inRows
}

export const generateAdvisorMoves: MoveGenerator = (board, from, piece) =>
  [
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ].flatMap((step) => {
    const target = { row: from.row + step.row, col: from.col + step.col }
    return isInPalace(target, piece) && canLand(board, target, piece) ? [target] : []
  })

export const generateGeneralMoves: MoveGenerator = (board, from, piece) =>
  ORTHOGONAL_DIRECTIONS.flatMap((step) => {
    const target = { row: from.row + step.row, col: from.col + step.col }
    return isInPalace(target, piece) && canLand(board, target, piece) ? [target] : []
  })

export const generatePawnMoves: MoveGenerator = (board, from, piece) => {
  const forward = piece.side === 'red' ? -1 : 1
  const hasCrossedRiver = piece.side === 'red' ? from.row <= 4 : from.row >= 5
  const steps: Step[] = [{ row: forward, col: 0 }]
  if (hasCrossedRiver) steps.push({ row: 0, col: -1 }, { row: 0, col: 1 })

  return steps.flatMap((step) => {
    const target = { row: from.row + step.row, col: from.col + step.col }
    return canLand(board, target, piece) ? [target] : []
  })
}

const GENERATORS: Record<XiangqiPiece['type'], MoveGenerator> = {
  rook: generateRookMoves,
  horse: generateHorseMoves,
  cannon: generateCannonMoves,
  elephant: generateElephantMoves,
  advisor: generateAdvisorMoves,
  general: generateGeneralMoves,
  pawn: generatePawnMoves,
}

export function generatePseudoLegalMoves(
  board: XiangqiBoard,
  from: XiangqiPosition,
): XiangqiPosition[] {
  if (!isInside(from)) return []
  const piece = occupant(board, from)
  if (!piece) return []
  return GENERATORS[piece.type](board, from, piece)
}
