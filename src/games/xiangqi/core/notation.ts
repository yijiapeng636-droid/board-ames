import type { XiangqiMove } from '@/games/xiangqi/types/xiangqi'

const RED_NUMBERS = ['九', '八', '七', '六', '五', '四', '三', '二', '一']
const BLACK_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const NAMES = {
  general: { red: '帅', black: '将' }, advisor: { red: '仕', black: '士' }, elephant: { red: '相', black: '象' },
  horse: { red: '马', black: '马' }, rook: { red: '车', black: '车' }, cannon: { red: '炮', black: '炮' }, pawn: { red: '兵', black: '卒' },
} as const

export function formatXiangqiMove(move: Pick<XiangqiMove, 'piece' | 'from' | 'to'>): string {
  const side = move.piece.side
  const numbers = side === 'red' ? RED_NUMBERS : BLACK_NUMBERS
  const name = NAMES[move.piece.type][side]
  const fromFile = numbers[move.from.col]
  if (move.from.row === move.to.row) return `${name}${fromFile}平${numbers[move.to.col]}`
  const forward = side === 'red' ? move.to.row < move.from.row : move.to.row > move.from.row
  const action = forward ? '进' : '退'
  const diagonalOrHorse = ['horse', 'elephant', 'advisor'].includes(move.piece.type)
  const destination = diagonalOrHorse ? numbers[move.to.col] : String(Math.abs(move.to.row - move.from.row))
  return `${name}${fromFile}${action}${destination}`
}
