import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import XiangqiBoardComponent from '@/games/xiangqi/components/XiangqiBoard.vue'
import {
  cloneXiangqiBoard,
  createInitialXiangqiBoard,
  serializeXiangqiBoard,
} from '@/games/xiangqi/core/board'
import { replayXiangqiHistory } from '@/games/xiangqi/core/history'
import type { XiangqiMove } from '@/games/xiangqi/types/xiangqi'

describe('xiangqi board foundation', () => {
  it('creates the standard 10 × 9 layout with 32 pieces', () => {
    const board = createInitialXiangqiBoard()
    expect(board).toHaveLength(10)
    expect(board.every((row) => row.length === 9)).toBe(true)
    expect(board.flat().filter(Boolean)).toHaveLength(32)
    expect(board[0]![4]).toMatchObject({ side: 'black', type: 'general' })
    expect(board[9]![4]).toMatchObject({ side: 'red', type: 'general' })
    expect(serializeXiangqiBoard(cloneXiangqiBoard(board))).toBe(serializeXiangqiBoard(board))
  })

  it('deterministically reconstructs boards and side to move from move history', () => {
    const initial = createInitialXiangqiBoard()
    const redPawn = initial[6]![0]!
    const blackPawn = initial[3]![0]!
    const moves: XiangqiMove[] = [
      {
        turn: 1,
        side: 'red',
        from: { row: 6, col: 0 },
        to: { row: 5, col: 0 },
        piece: redPawn,
        captured: null,
      },
      {
        turn: 2,
        side: 'black',
        from: { row: 3, col: 0 },
        to: { row: 4, col: 0 },
        piece: blackPawn,
        captured: null,
      },
      {
        turn: 3,
        side: 'red',
        from: { row: 5, col: 0 },
        to: { row: 4, col: 0 },
        piece: redPawn,
        captured: blackPawn,
      },
    ]

    const beforeCapture = replayXiangqiHistory(initial, moves, 2)
    expect(beforeCapture.sideToMove).toBe('red')
    expect(beforeCapture.board[5]![0]?.id).toBe(redPawn.id)
    expect(beforeCapture.board[4]![0]?.id).toBe(blackPawn.id)

    const afterCapture = replayXiangqiHistory(initial, moves)
    expect(afterCapture.sideToMove).toBe('black')
    expect(afterCapture.board[4]![0]?.id).toBe(redPawn.id)
    expect(initial[6]![0]?.id).toBe(redPawn.id)
  })

  it('reconstructs a bonus turn where the same side moves twice', () => {
    const initial = createInitialXiangqiBoard()
    const moves: XiangqiMove[] = [
      { turn: 1, side: 'red', from: { row: 6, col: 0 }, to: { row: 5, col: 0 }, piece: initial[6]![0]!, captured: null, nextSideToMove: 'red' },
      { turn: 2, side: 'red', from: { row: 6, col: 2 }, to: { row: 5, col: 2 }, piece: initial[6]![2]!, captured: null, nextSideToMove: 'black' },
    ]
    const replay = replayXiangqiHistory(initial, moves)
    expect(replay.sideToMove).toBe('black')
    expect(replay.board[5]![0]?.side).toBe('red')
    expect(replay.board[5]![2]?.side).toBe('red')
  })

  it('renders semantic buttons, selections, legal targets and last move markers', () => {
    const board = createInitialXiangqiBoard()
    const lastMove: XiangqiMove = {
      turn: 1,
      side: 'red',
      from: { row: 6, col: 0 },
      to: { row: 5, col: 0 },
      piece: board[6]![0]!,
      captured: null,
    }
    const wrapper = mount(XiangqiBoardComponent, {
      props: {
        board,
        selected: { row: 6, col: 0 },
        legalTargets: [{ row: 5, col: 0 }],
        lastMove,
      },
    })

    expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(90)
    expect(wrapper.find('.intersection.selected').exists()).toBe(true)
    expect(wrapper.find('.intersection.legal').exists()).toBe(true)
    expect(wrapper.find('.intersection.last-from').exists()).toBe(true)
    expect(wrapper.find('.intersection.last-to').exists()).toBe(true)
    expect(wrapper.find('button button').exists()).toBe(false)
  })
})
