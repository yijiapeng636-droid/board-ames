import { evaluateXiangqiBoard } from '@/games/xiangqi/ai/evaluation'
import { oppositeSide } from '@/games/xiangqi/core/board'
import { cloneXiangqiHistory } from '@/games/xiangqi/core/history'
import { applyXiangqiMove, generateLegalMoves } from '@/games/xiangqi/core/legalMoves'
import { adjudicateRepetition, createPositionKey } from '@/games/xiangqi/core/repetition'
import { getXiangqiGameStatus } from '@/games/xiangqi/core/result'
import { classifyXiangqiMove } from '@/games/xiangqi/rules/classification'
import type {
  XiangqiAdjudication,
  XiangqiBoard,
  XiangqiMove,
  XiangqiMoveOption,
  XiangqiPositionHistoryEntry,
  XiangqiSide,
} from '@/games/xiangqi/types/xiangqi'

export interface XiangqiSearchOptions {
  maxDepth?: number
  timeBudgetMs?: number
  positionHistory?: XiangqiPositionHistoryEntry[]
  mustChangeSide?: XiangqiSide | null
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

interface PendingClassification {
  index: number
  board: XiangqiBoard
  move: XiangqiMove
}

interface SearchHistoryState {
  entries: XiangqiPositionHistoryEntry[]
  pending: PendingClassification[]
  mustChangeSide: XiangqiSide | null
}

const MATE_SCORE = 1_000_000

function moveOrderScore(move: XiangqiMoveOption): number {
  const values = { general: 100_000, rook: 900, cannon: 450, horse: 420, elephant: 200, advisor: 200, pawn: 100 }
  return move.captured ? values[move.captured.type] * 10 - values[move.piece.type] : 0
}

function materializePending(state: SearchHistoryState): XiangqiPositionHistoryEntry[] {
  if (state.pending.length === 0) return state.entries
  const byIndex = new Map(state.pending.map((item) => [item.index, item]))
  return state.entries.map((entry, index) => {
    if (entry.classification) return entry
    const pending = byIndex.get(index)
    return pending ? { ...entry, classification: classifyXiangqiMove(pending.board, pending.move) } : entry
  })
}

function advanceHistory(
  state: SearchHistoryState,
  board: XiangqiBoard,
  moveOption: XiangqiMoveOption,
  nextBoard: XiangqiBoard,
  nextSide: XiangqiSide,
): { state: SearchHistoryState; ruling: XiangqiAdjudication } {
  const lastTurn = state.entries[state.entries.length - 1]?.move?.turn ?? 0
  const move: XiangqiMove = { ...moveOption, turn: lastTurn + 1, nextSideToMove: nextSide }
  const key = createPositionKey(nextBoard, nextSide)
  const entries = [...state.entries, { key, sideToMove: nextSide, move, classification: null }]
  const pending = [...state.pending, { index: entries.length - 1, board, move }]
  const occurrenceCount = entries.filter((entry) => entry.key === key).length
  if (occurrenceCount < 3) {
    const nextMustChange = state.mustChangeSide === move.side ? null : state.mustChangeSide
    return {
      state: { entries, pending, mustChangeSide: nextMustChange },
      ruling: { verdict: 'none', responsibleSide: null, reason: '尚未形成三次循环', ruleReference: '24.9-24.14', cycleStart: null, cycleEnd: null },
    }
  }

  const materialized = materializePending({ ...state, entries, pending })
  const ruling = adjudicateRepetition(materialized, state.mustChangeSide)
  const nextMustChange = ruling.verdict === 'mustChange'
    ? ruling.responsibleSide
    : ruling.verdict === 'none' && state.mustChangeSide === move.side
      ? null
      : state.mustChangeSide
  return { state: { entries: materialized, pending: [], mustChangeSide: nextMustChange }, ruling }
}

function rulingScore(ruling: XiangqiAdjudication, perspective: XiangqiSide, depth: number): number | null {
  if (ruling.verdict === 'draw') return 0
  if (ruling.verdict !== 'loss' || !ruling.responsibleSide) return null
  return ruling.responsibleSide === perspective ? -MATE_SCORE - depth : MATE_SCORE + depth
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
  const initialHistory: SearchHistoryState = {
    entries: options.positionHistory
      ? cloneXiangqiHistory(options.positionHistory)
      : [{ key: createPositionKey(board, side), sideToMove: side, move: null, classification: null }],
    pending: [],
    mustChangeSide: options.mustChangeSide ?? null,
  }

  function stopped() {
    const value = performance.now() >= deadline || options.shouldAbort?.() === true
    if (value) aborted = true
    return value
  }

  function negamax(
    position: XiangqiBoard,
    turn: XiangqiSide,
    depth: number,
    alpha: number,
    beta: number,
    history: SearchHistoryState,
  ): { score: number; pv: XiangqiMoveOption[] } {
    nodes += 1
    if (stopped()) return { score: evaluateXiangqiBoard(position, turn), pv: [] }

    const status = getXiangqiGameStatus(position, turn)
    if (status.result) {
      if (status.result === 'draw') return { score: 0, pv: [] }
      return { score: status.result === `${turn}Win` ? MATE_SCORE + depth : -MATE_SCORE - depth, pv: [] }
    }
    if (depth === 0) return { score: evaluateXiangqiBoard(position, turn), pv: [] }

    let best = -Infinity
    let bestPv: XiangqiMoveOption[] = []
    const moves = [...status.legalMoves].sort((a, b) => moveOrderScore(b) - moveOrderScore(a))
    for (const move of moves) {
      const nextSide = oppositeSide(turn)
      const next = applyXiangqiMove(position, move)
      const advanced = advanceHistory(history, position, move, next, nextSide)
      const directRulingScore = rulingScore(advanced.ruling, turn, depth)
      const child = directRulingScore === null
        ? negamax(next, nextSide, depth - 1, -beta, -alpha, advanced.state)
        : { score: -directRulingScore, pv: [] }
      const score = directRulingScore ?? -child.score
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
      const nextSide = oppositeSide(side)
      const next = applyXiangqiMove(board, move)
      const advanced = advanceHistory(initialHistory, board, move, next, nextSide)
      const directRulingScore = rulingScore(advanced.ruling, side, depth)
      const child = directRulingScore === null
        ? negamax(next, nextSide, depth - 1, -Infinity, Infinity, advanced.state)
        : { score: -directRulingScore, pv: [] }
      iteration.push({ ...move, score: directRulingScore ?? -child.score, depth, principalVariation: [move, ...child.pv] })
    }
    if (complete) completed = iteration.sort((a, b) => b.score - a.score)
  }
  return { candidates: completed, depth: completed[0]?.depth ?? 0, nodes, elapsedMs: performance.now() - started, aborted }
}
