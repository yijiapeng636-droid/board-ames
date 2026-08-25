import { searchXiangqi } from '@/games/xiangqi/ai/search'
import { formatXiangqiMove } from '@/games/xiangqi/core/notation'
import { replayXiangqiHistory } from '@/games/xiangqi/core/history'
import type { XiangqiBoard, XiangqiMove, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

export interface XiangqiReviewPoint { turn: number; actual: string; suggested: string; scoreLoss: number }

export function analyzeXiangqiReview(initialBoard: XiangqiBoard, moves: XiangqiMove[], humanSide: XiangqiSide): XiangqiReviewPoint[] {
  const points: XiangqiReviewPoint[] = []
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index]!
    if (move.side !== humanSide) continue
    const state = replayXiangqiHistory(initialBoard, moves, index)
    const result = searchXiangqi(state.board, humanSide, { maxDepth: 1, timeBudgetMs: 250 })
    const best = result.candidates[0]
    const actual = result.candidates.find((candidate) => candidate.from.row === move.from.row && candidate.from.col === move.from.col && candidate.to.row === move.to.row && candidate.to.col === move.to.col)
    if (best && (!actual || best.score - actual.score >= 80)) points.push({ turn: move.turn, actual: formatXiangqiMove(move), suggested: formatXiangqiMove(best), scoreLoss: best.score - (actual?.score ?? best.score - 100) })
  }
  return points.sort((a, b) => b.scoreLoss - a.scoreLoss).slice(0, 6)
}
