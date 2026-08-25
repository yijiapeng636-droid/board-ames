import { describe, expect, it } from 'vitest'
import {
  generateAdvisorMoves,
  generateCannonMoves,
  generateElephantMoves,
  generateGeneralMoves,
  generateHorseMoves,
  generatePawnMoves,
  generatePseudoLegalMoves,
  generateRookMoves,
} from '@/games/xiangqi/core/pieceMoves'
import type {
  XiangqiBoard,
  XiangqiPiece,
  XiangqiPieceType,
  XiangqiPosition,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

function emptyBoard(): XiangqiBoard {
  return Array.from({ length: 10 }, () => Array<XiangqiPiece | null>(9).fill(null))
}

function place(
  board: XiangqiBoard,
  side: XiangqiSide,
  type: XiangqiPieceType,
  row: number,
  col: number,
  id = `${side}-${type}-${row}-${col}`,
): XiangqiPiece {
  const piece = { id, side, type }
  board[row]![col] = piece
  return piece
}

function keys(positions: XiangqiPosition[]): string[] {
  return positions.map(({ row, col }) => `${row},${col}`).sort()
}

describe('xiangqi pseudo-legal piece moves', () => {
  it('moves a rook orthogonally until the first blocker and can capture only an enemy', () => {
    const board = emptyBoard()
    const rook = place(board, 'red', 'rook', 4, 4)
    place(board, 'red', 'pawn', 2, 4)
    place(board, 'black', 'pawn', 6, 4)
    place(board, 'black', 'pawn', 4, 1)
    place(board, 'red', 'pawn', 4, 6)

    expect(keys(generateRookMoves(board, { row: 4, col: 4 }, rook))).toEqual(
      keys([
        { row: 3, col: 4 },
        { row: 5, col: 4 },
        { row: 6, col: 4 },
        { row: 4, col: 3 },
        { row: 4, col: 2 },
        { row: 4, col: 1 },
        { row: 4, col: 5 },
      ]),
    )
  })

  it('moves a horse in an L shape and blocks both moves sharing an occupied horse leg', () => {
    const board = emptyBoard()
    const horse = place(board, 'red', 'horse', 4, 4)
    place(board, 'black', 'pawn', 3, 4)
    place(board, 'red', 'pawn', 6, 5)

    expect(keys(generateHorseMoves(board, { row: 4, col: 4 }, horse))).toEqual(
      keys([
        { row: 6, col: 3 },
        { row: 3, col: 2 },
        { row: 5, col: 2 },
        { row: 3, col: 6 },
        { row: 5, col: 6 },
      ]),
    )
  })

  it('moves a cannon without a screen and captures only the first enemy beyond one screen', () => {
    const board = emptyBoard()
    const cannon = place(board, 'red', 'cannon', 4, 4)
    place(board, 'red', 'pawn', 4, 3)
    place(board, 'black', 'rook', 4, 1)
    place(board, 'black', 'pawn', 2, 4)
    place(board, 'black', 'rook', 0, 4)
    place(board, 'red', 'pawn', 4, 6)
    place(board, 'red', 'rook', 4, 8)

    expect(keys(generateCannonMoves(board, { row: 4, col: 4 }, cannon))).toEqual(
      keys([
        { row: 3, col: 4 },
        { row: 0, col: 4 },
        { row: 5, col: 4 },
        { row: 6, col: 4 },
        { row: 7, col: 4 },
        { row: 8, col: 4 },
        { row: 9, col: 4 },
        { row: 4, col: 1 },
        { row: 4, col: 5 },
      ]),
    )
  })

  it('moves an elephant diagonally, cannot cross the river and is blocked at its eye', () => {
    const board = emptyBoard()
    const redElephant = place(board, 'red', 'elephant', 7, 4)
    place(board, 'black', 'pawn', 5, 2)
    place(board, 'red', 'pawn', 6, 5)

    expect(keys(generateElephantMoves(board, { row: 7, col: 4 }, redElephant))).toEqual(
      keys([
        { row: 5, col: 2 },
        { row: 9, col: 2 },
        { row: 9, col: 6 },
      ]),
    )

    const riverBoard = emptyBoard()
    const edgeElephant = place(riverBoard, 'red', 'elephant', 5, 4)
    expect(keys(generateElephantMoves(riverBoard, { row: 5, col: 4 }, edgeElephant))).toEqual(
      keys([
        { row: 7, col: 2 },
        { row: 7, col: 6 },
      ]),
    )
  })

  it('keeps advisors on palace diagonals and generals on palace orthogonal steps', () => {
    const board = emptyBoard()
    const advisor = place(board, 'red', 'advisor', 8, 4)
    expect(keys(generateAdvisorMoves(board, { row: 8, col: 4 }, advisor))).toEqual(
      keys([
        { row: 7, col: 3 },
        { row: 7, col: 5 },
        { row: 9, col: 3 },
        { row: 9, col: 5 },
      ]),
    )

    board[8]![4] = null
    const general = place(board, 'black', 'general', 0, 4)
    place(board, 'black', 'advisor', 0, 3)
    expect(keys(generateGeneralMoves(board, { row: 0, col: 4 }, general))).toEqual(
      keys([
        { row: 0, col: 5 },
        { row: 1, col: 4 },
      ]),
    )
  })

  it('moves pawns forward before crossing and sideways but never backward after crossing', () => {
    const board = emptyBoard()
    const redPawn = place(board, 'red', 'pawn', 5, 4)
    const blackPawn = place(board, 'black', 'pawn', 5, 6)

    expect(keys(generatePawnMoves(board, { row: 5, col: 4 }, redPawn))).toEqual(['4,4'])
    expect(keys(generatePawnMoves(board, { row: 5, col: 6 }, blackPawn))).toEqual(
      keys([
        { row: 5, col: 5 },
        { row: 5, col: 7 },
        { row: 6, col: 6 },
      ]),
    )
  })

  it('dispatches by piece type and safely returns no moves for empty or out-of-board squares', () => {
    const board = emptyBoard()
    place(board, 'red', 'pawn', 6, 0)
    expect(generatePseudoLegalMoves(board, { row: 6, col: 0 })).toEqual([{ row: 5, col: 0 }])
    expect(generatePseudoLegalMoves(board, { row: 4, col: 4 })).toEqual([])
    expect(generatePseudoLegalMoves(board, { row: -1, col: 0 })).toEqual([])
  })
})
