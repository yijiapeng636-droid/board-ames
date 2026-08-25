import { evaluateXiangqiBoard } from '@/games/xiangqi/ai/evaluation'
import { oppositeSide } from '@/games/xiangqi/core/board'
import { applyXiangqiMove, generateLegalMoves } from '@/games/xiangqi/core/legalMoves'
import { createPositionKey } from '@/games/xiangqi/core/repetition'
import { getXiangqiGameStatus } from '@/games/xiangqi/core/result'
import type { XiangqiBoard, XiangqiMoveOption, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

export interface XiangqiSearchOptions {
  maxDepth?: number
  timeBudgetMs?: number
  positionHistory?: string[]
  shouldAbort?: () => boolean
}

export interface XiangqiSearchCandidate extends XiangqiMoveOption {
  score: number
  depth: number
  principalVariation: XiangqiMoveOption[]
}

export interface XiangqiSearchResult {
  candidates: XiangqiSearchCandidate[]
  depth: number
  nodes: number
  elapsedMs: number
  aborted: boolean
}

const MATE_SCORE = 1_000_000

function moveOrderScore(move: XiangqiMoveOption): number {
  const values = { general: 100_000, rook: 900, cannon: 450, horse: 420, elephant: 200, advisor: 200, pawn: 100 }
  return (move.captured ? values[move.captured.type] * 10 - values[move.piece.type] : 0)
}

export function searchXiangqi(
  board: XiangqiBoard,
  side: XiangqiSide,
  options: XiangqiSearchOptions = {},
): XiangqiSearchResult {
  const started = performance.now()
  const deadline = started + (options.timeBudgetMs ?? 800)
  const maxDepth = options.maxDepth ?? 3
  let nodes = 0
  let aborted = false
  let completed: XiangqiSearchCandidate[] = []

  function stopped() {
    const value = performance.now() >= deadline || options.shouldAbort?.() === true
    if (value) aborted = true
    return value
  }

  function negamax(position: XiangqiBoard, turn: XiangqiSide, depth: number, alpha: number, beta: number, history: string[]): { score: number; pv: XiangqiMoveOption[] } {
    nodes += 1
    if (stopped()) return { score: evaluateXiangqiBoard(position, turn), pv: [] }
    const key = createPositionKey(position, turn)
    if (history.filter((item) => item === key).length >= 2) return { score: 0, pv: [] }
    if (depth === 0) return { score: evaluateXiangqiBoard(position, turn), pv: [] }
    const status = getXiangqiGameStatus(position, turn)
    if (status.result) {
      if (status.result === 'draw') return { score: 0, pv: [] }
      return { score: status.result === `${turn}Win` ? MATE_SCORE + depth : -MATE_SCORE - depth, pv: [] }
    }
    let best = -Infinity
    let bestPv: XiangqiMoveOption[] = []
    const moves = [...status.legalMoves].sort((a, b) => moveOrderScore(b) - moveOrderScore(a))
    for (const move of moves) {
      const child = negamax(applyXiangqiMove(position, move), oppositeSide(turn), depth - 1, -beta, -alpha, [...history, key])
      const score = -child.score
      if (score > best) {
        best = score
        bestPv = [move, ...child.pv]
      }
      alpha = Math.max(alpha, score)
      if (alpha >= beta || stopped()) break
    }
    return { score: best, pv: bestPv }
  }

  const rootMoves = [...generateLegalMoves(board, side)].sort((a, b) => moveOrderScore(b) - moveOrderScore(a))
  for (let depth = 1; depth <= maxDepth && !stopped(); depth += 1) {
    const iteration: XiangqiSearchCandidate[] = []
    let complete = true
    for (const move of rootMoves) {
      if (stopped()) { complete = false; break }
      const child = negamax(applyXiangqiMove(board, move), oppositeSide(side), depth - 1, -Infinity, Infinity, options.positionHistory ?? [])
      iteration.push({ ...move, score: -child.score, depth, principalVariation: [move, ...child.pv] })
    }
    if (complete) completed = iteration.sort((a, b) => b.score - a.score)
  }
  return { candidates: completed, depth: completed[0]?.depth ?? 0, nodes, elapsedMs: performance.now() - started, aborted }
}
