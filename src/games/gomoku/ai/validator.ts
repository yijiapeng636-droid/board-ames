import { isInBounds } from '@/games/gomoku/core/game'
import type { AIMove, Board, GamePhase, GameResult } from '@/games/gomoku/types/gomoku'

export function validateAIMove(
  value: unknown,
  board: Board,
  phase: GamePhase,
  result: GameResult,
  candidates: ReadonlyArray<{ row: number; col: number }>,
): AIMove {
  if (phase !== 'aiThinking' || result !== null) throw new Error('当前不是 AI 可落子阶段')
  if (!value || typeof value !== 'object') throw new Error('AI 返回的落点不是对象')

  const candidate = value as Record<string, unknown>
  if (!Number.isInteger(candidate.row) || !Number.isInteger(candidate.col)) {
    throw new Error('AI 返回的 row 和 col 必须是整数')
  }

  const row = candidate.row as number
  const col = candidate.col as number
  if (!isInBounds(row, col)) throw new Error('AI 返回的落点超出棋盘范围')
  if (board[row]![col] !== 0) throw new Error(`AI 返回的 (${row}, ${col}) 已有棋子`)
  if (!candidates.some((candidate) => candidate.row === row && candidate.col === col)) {
    throw new Error(`AI 返回的 (${row}, ${col}) 不在候选点中`)
  }
  if (candidate.reason !== undefined && typeof candidate.reason !== 'string') {
    throw new Error('AI 返回的 reason 必须是字符串')
  }

  return { row, col, ...(candidate.reason ? { reason: candidate.reason } : {}) }
}
