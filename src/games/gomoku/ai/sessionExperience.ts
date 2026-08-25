import { SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import type {
  Board,
  GameResult,
  Move,
  Player,
  PositionExperienceSummary,
  ReviewSummary,
  SessionReviewHistorySummary,
  SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

export const SESSION_EXPERIENCE_KEY = 'gomoku:session-experience:v2'

export type AIDecisionSource =
  'forcedWin' | 'forcedBlock' | 'forcedTactical' | 'deepseek' | 'searchFallback'

export interface AIDecisionRecord {
  positionKey: string
  selectedMove: { row: number; col: number }
  searchScore?: number
  localBestMove?: { row: number; col: number }
  localBestScore?: number
  source: AIDecisionSource
}

export interface SessionGameRecord {
  id: string
  startedAt: number
  finishedAt?: number
  result?: Exclude<GameResult, null>
  moves: Move[]
  aiDecisions: AIDecisionRecord[]
  aiPlayer?: Player
  reviewSummary?: ReviewSummary
}

let records: SessionGameRecord[] = loadRecords()

function isRecord(value: unknown): value is SessionGameRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SessionGameRecord>
  return (
    typeof record.id === 'string' &&
    typeof record.startedAt === 'number' &&
    Array.isArray(record.moves) &&
    Array.isArray(record.aiDecisions)
  )
}

function loadRecords(): SessionGameRecord[] {
  try {
    const raw = sessionStorage.getItem(SESSION_EXPERIENCE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isRecord)) throw new Error('invalid experience')
    return parsed.slice(-SEARCH_CONFIG.sessionGameLimit)
  } catch {
    try {
      sessionStorage.removeItem(SESSION_EXPERIENCE_KEY)
    } catch {
      // Storage may be unavailable; the in-memory experience remains usable.
    }
    return []
  }
}

function persist() {
  records = records.slice(-SEARCH_CONFIG.sessionGameLimit)
  try {
    sessionStorage.setItem(SESSION_EXPERIENCE_KEY, JSON.stringify(records))
  } catch {
    // Session experience is optional and must never block the game.
  }
}

function copyMoves(moves: Move[]) {
  return moves.map((move) => ({ ...move }))
}

export function createPositionKey(board: Board, currentPlayer: 1 | 2) {
  return `${board.map((line) => line.join('')).join('')}|${currentPlayer}`
}

export function startSessionGame(initialMoves: Move[] = [], aiPlayer: Player = 2) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  records.push({
    id,
    startedAt: Date.now(),
    moves: copyMoves(initialMoves),
    aiDecisions: [],
    aiPlayer,
  })
  persist()
  return id
}

export function recordAIDecision(gameId: string, decision: AIDecisionRecord, moves: Move[]) {
  const game = records.find((record) => record.id === gameId)
  if (!game) return
  game.aiDecisions.push({
    ...decision,
    selectedMove: { ...decision.selectedMove },
    ...(decision.localBestMove ? { localBestMove: { ...decision.localBestMove } } : {}),
  })
  game.moves = copyMoves(moves)
  persist()
}

export function finishSessionGame(
  gameId: string,
  result: Exclude<GameResult, null>,
  moves: Move[],
) {
  const game = records.find((record) => record.id === gameId)
  if (!game || game.finishedAt) return
  game.result = result
  game.finishedAt = Date.now()
  game.moves = copyMoves(moves)
  persist()
}

export function discardUnfinishedGame(gameId: string) {
  records = records.filter((record) => record.id !== gameId || record.finishedAt)
  persist()
}

export function removeSessionGame(gameId: string) {
  records = records.filter((record) => record.id !== gameId)
  persist()
}

export function saveReviewSummary(gameId: string, summary: ReviewSummary) {
  const game = records.find((record) => record.id === gameId)
  if (!game) return
  game.reviewSummary = {
    ...summary,
    mistakeTags: [...summary.mistakeTags],
    strengthTags: [...summary.strengthTags],
    lessons: [...summary.lessons],
  }
  persist()
}

export function getSessionReviewHistorySummary(): SessionReviewHistorySummary {
  const summaries = records.flatMap((record) =>
    record.reviewSummary ? [record.reviewSummary] : [],
  )
  const counts = new Map<string, number>()
  for (const summary of summaries) {
    for (const tag of new Set(summary.mistakeTags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return {
    reviewedGames: summaries.length,
    repeatedMistakeTags: [...counts]
      .filter(([, count]) => count >= 2)
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag)),
    recentLessons: summaries
      .slice(-3)
      .flatMap((summary) => summary.lessons)
      .slice(-6),
  }
}

export function getPositionExperience(positionKey: string): PositionExperienceSummary | undefined {
  const related = records.flatMap((game) =>
    game.result
      ? game.aiDecisions
          .filter((decision) => decision.positionKey === positionKey)
          .map((decision) => ({ game, decision }))
      : [],
  )
  if (related.length === 0) return undefined

  const moveStats = new Map<string, PositionExperienceSummary['moves'][number]>()
  for (const { game, decision } of related) {
    const key = `${decision.selectedMove.row}-${decision.selectedMove.col}`
    const stats = moveStats.get(key) ?? {
      ...decision.selectedMove,
      played: 0,
      finalResults: { win: 0, loss: 0, draw: 0 },
    }
    stats.played += 1
    const aiWon =
      (game.result === 'whiteWin' && (game.aiPlayer ?? 2) === 2) ||
      (game.result === 'blackWin' && game.aiPlayer === 1)
    if (aiWon) stats.finalResults.win += 1
    else if (game.result !== 'draw') stats.finalResults.loss += 1
    else stats.finalResults.draw += 1
    moveStats.set(key, stats)
  }
  return { seen: related.length, moves: [...moveStats.values()] }
}

export function decisionFromCandidate(
  positionKey: string,
  selected: SearchedCandidate,
  localBest: SearchedCandidate,
  source: AIDecisionSource,
): AIDecisionRecord {
  return {
    positionKey,
    selectedMove: { row: selected.row, col: selected.col },
    searchScore: selected.searchScore,
    localBestMove: { row: localBest.row, col: localBest.col },
    localBestScore: localBest.searchScore,
    source,
  }
}

export function clearSessionExperience() {
  records = []
  try {
    sessionStorage.removeItem(SESSION_EXPERIENCE_KEY)
  } catch {
    // Keep clear safe when storage is unavailable.
  }
}

export function reloadSessionExperience() {
  records = loadRecords()
}

export function getSessionGames() {
  return records.map((record) => ({
    ...record,
    moves: copyMoves(record.moves),
    aiDecisions: record.aiDecisions.map((decision) => ({ ...decision })),
    ...(record.reviewSummary
      ? {
          reviewSummary: {
            ...record.reviewSummary,
            mistakeTags: [...record.reviewSummary.mistakeTags],
            strengthTags: [...record.reviewSummary.strengthTags],
            lessons: [...record.reviewSummary.lessons],
          },
        }
      : {}),
  }))
}
