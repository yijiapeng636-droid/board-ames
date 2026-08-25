import { describe, expect, it } from 'vitest'
import { serializeXiangqiBoard } from '@/games/xiangqi/core/board'
import {
  areGeneralsFacing,
  generateLegalMoves,
  isInCheck,
  isSquareAttacked,
} from '@/games/xiangqi/core/legalMoves'
import { getXiangqiGameStatus } from '@/games/xiangqi/core/result'
import type {
  XiangqiBoard,
  XiangqiPiece,
  XiangqiPieceType,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

function emptyBoard(): XiangqiBoard {
  return Array.from({ length: 10 }, () => Array<XiangqiPiece | null>(9).fill(null))
}

function place(board: XiangqiBoard, side: XiangqiSide, type: XiangqiPieceType, row: number, col: number) {
  board[row]![col] = { id: `${side}-${type}-${row}-${col}`, side, type }
}

function baseBoard(): XiangqiBoard {
  const board = emptyBoard()
  place(board, 'black', 'general', 0, 4)
  place(board, 'red', 'general', 9, 4)
  place(board, 'red', 'pawn', 5, 4)
  return board
}

describe('xiangqi attack and legal move rules', () => {
  it('detects attacks without changing the input board', () => {
    const board = baseBoard()
    place(board, 'black', 'rook', 9, 0)
    const before = serializeXiangqiBoard(board)
    expect(isSquareAttacked(board, { row: 9, col: 4 }, 'black')).toBe(true)
    expect(isInCheck(board, 'red')).toBe(true)
    expect(serializeXiangqiBoard(board)).toBe(before)
  })

  it('detects facing generals and filters moves exposing them', () => {
    const board = baseBoard()
    expect(areGeneralsFacing(board)).toBe(false)
    const moves = generateLegalMoves(board, 'red')
    expect(moves.some((move) => move.from.row === 5 && move.to.col !== 4)).toBe(false)
  })

  it('filters moves that do not answer check while preserving valid responses', () => {
    const board = baseBoard()
    place(board, 'black', 'rook', 9, 0)
    place(board, 'red', 'rook', 8, 8)
    const moves = generateLegalMoves(board, 'red')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((move) => move.piece.type === 'general' || move.to.row === 9)).toBe(true)
  })

  it('recognizes checkmate and stalemate as losses for the side with no legal move', () => {
    const mate = emptyBoard()
    place(mate, 'black', 'general', 0, 4)
    place(mate, 'red', 'general', 9, 4)
    place(mate, 'red', 'rook', 1, 4)
    place(mate, 'red', 'rook', 2, 3)
    place(mate, 'red', 'rook', 2, 5)
    expect(getXiangqiGameStatus(mate, 'black')).toMatchObject({
      inCheck: true,
      result: 'redWin',
      reason: 'checkmate',
    })

    const stalemate = emptyBoard()
    place(stalemate, 'black', 'general', 0, 4)
    place(stalemate, 'red', 'general', 9, 4)
    place(stalemate, 'red', 'pawn', 1, 3)
    place(stalemate, 'red', 'pawn', 1, 5)
    place(stalemate, 'red', 'pawn', 5, 4)
    expect(getXiangqiGameStatus(stalemate, 'black')).toMatchObject({
      inCheck: false,
      result: 'redWin',
      reason: 'stalemate',
    })
  })

  it('recognizes a position without mating material as a basic draw', () => {
    const board = emptyBoard()
    place(board, 'black', 'general', 0, 4)
    place(board, 'red', 'general', 9, 4)
    place(board, 'red', 'advisor', 9, 3)
    place(board, 'black', 'elephant', 0, 2)
    expect(getXiangqiGameStatus(board, 'red')).toMatchObject({
      result: 'draw',
      reason: 'insufficientMaterial',
    })
  })
})
