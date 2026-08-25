import { describe, expect, it } from 'vitest'
import { createBoard, isBoardFull, placePiece, resultAfterMove } from '@/games/gomoku/core/game'
import type { Move } from '@/games/gomoku/types/gomoku'

describe('game engine', () => {
  it('creates a 15 x 15 empty board and places a piece', () => {
    const board = createBoard()
    const moves: Move[] = []
    expect(board).toHaveLength(15)
    expect(board.every((line) => line.length === 15 && line.every((piece) => piece === 0))).toBe(
      true,
    )
    placePiece(board, moves, 7, 8, 1, 'playerTurn')
    expect(board[7]?.[8]).toBe(1)
    expect(moves).toEqual([{ turn: 1, player: 1, row: 7, col: 8 }])
  })

  it('rejects out-of-bounds, occupied, and game-over moves', () => {
    const board = createBoard()
    const moves: Move[] = []
    expect(() => placePiece(board, moves, -1, 0, 1)).toThrow('超出')
    expect(() => placePiece(board, moves, 15, 0, 1)).toThrow('超出')
    placePiece(board, moves, 0, 0, 1)
    expect(() => placePiece(board, moves, 0, 0, 2)).toThrow('已有')
    expect(() => placePiece(board, moves, 1, 1, 1, 'gameOver')).toThrow('已经结束')
  })

  it('detects a full board draw when the last move does not win', () => {
    const board = createBoard()
    for (let row = 0; row < 15; row += 1) {
      for (let col = 0; col < 15; col += 1) board[row]![col] = (row + col * 2) % 4 < 2 ? 1 : 2
    }
    expect(isBoardFull(board)).toBe(true)
    expect(resultAfterMove(board, 14, 14)).toBe('draw')
  })
})
