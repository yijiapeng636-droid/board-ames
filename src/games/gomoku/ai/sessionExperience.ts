import { analyzeAgentPostmortemInWorker } from '@/games/gomoku/ai/agentPostmortemClient'
import type { AgentPostmortemFinding } from '@/games/gomoku/ai/agentPostmortem'
import { BOARD_SIZE } from '@/games/gomoku/types/gomoku'
import { postJson } from '@/ai/runtime/jsonTransport'
import type {
  Board,
  DecisionSource,
  GameResult,
  GomokuAIDiagnostic,
  Move,
  Player,
  PositionExperienceSummary,
  ReviewSummary,
  SessionReviewHistorySummary,
  SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

export const SESSION_EXPERIENCE_KEY = 'gomoku:session-experience:v2'

export interface GameHistoryMove extends Move {
  id: string
  occurredAt?: number
  phase: string
  revertedAt?: number
  revertReason?: string
}

export interface GameAnomaly {
  id: string
  occurredAt: number
  subsystem: string
  stage: string
  code: string
  message: string
  fingerprint: string
  moveNumber?: number
  recoverable: boolean
  fallbackAction?: string
  unexpected: boolean
  severity?: 'warning' | 'critical'
  evidence?: string[]
  positionKey?: string
  selectedMove?: { row: number; col: number }
  recommendedMove?: { row: number; col: number }
}

export interface GameAnomalyInput {
  subsystem: string
  stage: string
  code: string
  message: string
  moveNumber?: number
  recoverable: boolean
  fallbackAction?: string
  severity?: 'warning' | 'critical'
  evidence?: string[]
  positionKey?: string
  selectedMove?: { row: number; col: number }
  recommendedMove?: { row: number; col: number }
}

export interface HistoricalAnomalySummary {
  advisory: true
  groups: Array<{ fingerprint: string; count: number; lastSeenAt: number; lessons: string[] }>
  examples: GameAnomaly[]
}

export interface GameAnomalyReview {
  summary: string
  anomalyIds: string[]
  lessons: string[]
  followUps: string[]
}

export type GameAnomalyRetrospective =
  | {
      status: 'pending'
      revision?: number
      reviewingAnomalyIds?: string[]
    }
  | ({
      status: 'completed'
      revision?: number
      reviewedAnomalyIds?: string[]
    } & GameAnomalyReview)
  | {
      status: 'failed'
      revision?: number
      attemptedAnomalyIds?: string[]
      error: string
      retryable: true
    }

export type AgentPostmortemState =
  | { status: 'pending'; version: 1; startedAt: number }
  | {
      status: 'completed'
      version: 1
      startedAt: number
      completedAt: number
      findingCount: number
    }
  | {
      status: 'failed'
      version: 1
      startedAt: number
      completedAt: number
      error: string
    }

export interface GameHistoryRecord {
  id: string
  schemaVersion: 1
  status: 'active' | 'completed' | 'interrupted'
  startedAt: number
  finishedAt?: number
  interruptionReason?: string
  result?: Exclude<GameResult, null>
  humanPlayer: Player
  aiPlayer: Player
  boardSize: number
  legacy?: true
  incomplete?: true
  moves: GameHistoryMove[]
  aiDecisions: AIDecisionRecord[]
  aiDiagnostics: GomokuAIDiagnostic[]
  anomalies: GameAnomaly[]
  reviewSummary?: ReviewSummary
  retrospective?: GameAnomalyRetrospective
  agentPostmortem?: AgentPostmortemState
}

export interface GameHistoryStorage {
  load(): Promise<GameHistoryRecord[]>
  save(records: GameHistoryRecord[]): Promise<void>
}

interface GameHistoryServiceOptions {
  storage: GameHistoryStorage
  now?: () => number
  id?: () => string
  reviewAnomalies?: (game: GameHistoryRecord) => Promise<GameAnomalyReview>
}

export function createGameHistoryService({
  storage,
  now = Date.now,
  id = () => crypto.randomUUID(),
  reviewAnomalies,
}: GameHistoryServiceOptions) {
  let games: GameHistoryRecord[] = []
  let writes = Promise.resolve()
  let writeScheduled = false
  let dirty = false

  const sanitize = (message: string) =>
    message
      .slice(0, 240)
      .replace(/Authorization:\s*Bearer\s+\S+/giu, '[redacted]')
      .replace(/\bsk-[\w-]+/giu, '[redacted]')

  const persist = () => {
    dirty = true
    if (writeScheduled) return
    writeScheduled = true
    writes = writes
      .then(async () => {
        do {
          dirty = false
          await storage.save(structuredClone(games))
        } while (dirty)
      })
      .catch(() => undefined)
      .finally(() => {
        writeScheduled = false
        if (dirty) persist()
      })
  }

  const reviewedAnomalyIds = (game: GameHistoryRecord) => {
    if (game.retrospective?.status !== 'completed') return new Set<string>()
    return new Set(game.retrospective.reviewedAnomalyIds ?? game.retrospective.anomalyIds)
  }

  const scheduleRetrospective = (game: GameHistoryRecord) => {
    if (!reviewAnomalies || game.anomalies.length === 0) return
    if (game.retrospective?.status === 'pending') return

    const reviewed = reviewedAnomalyIds(game)
    const targetAnomalyIds = game.anomalies.map((anomaly) => anomaly.id)
    if (targetAnomalyIds.every((anomalyId) => reviewed.has(anomalyId))) return

    const revision = (game.retrospective?.revision ?? 0) + 1
    game.retrospective = {
      status: 'pending',
      revision,
      reviewingAnomalyIds: [...targetAnomalyIds],
    }
    persist()

    writes = writes.then(async () => {
      const snapshot = structuredClone(game)

      try {
        const review = await reviewAnomalies(snapshot)
        const validIds = new Set(snapshot.anomalies.map((anomaly) => anomaly.id))
        if (!review.anomalyIds.every((anomalyId) => validIds.has(anomalyId))) {
          throw new Error('Anomaly review referenced an unknown anomaly')
        }

        game.retrospective = {
          status: 'completed',
          revision,
          reviewedAnomalyIds: [...targetAnomalyIds],
          summary: sanitize(review.summary),
          anomalyIds: [...new Set(review.anomalyIds)],
          lessons: review.lessons.slice(0, 6).map(sanitize),
          followUps: review.followUps.slice(0, 6).map(sanitize),
        }
      } catch (error) {
        game.retrospective = {
          status: 'failed',
          revision,
          attemptedAnomalyIds: [...targetAnomalyIds],
          error: sanitize(error instanceof Error ? error.message : 'Anomaly review failed'),
          retryable: true,
        }
      }

      await storage.save(structuredClone(games)).catch(() => undefined)

      const completed = game.retrospective
      if (completed.status === 'completed') {
        const reviewedNow = new Set(completed.reviewedAnomalyIds ?? completed.anomalyIds)
        if (game.anomalies.some((anomaly) => !reviewedNow.has(anomaly.id))) {
          scheduleRetrospective(game)
        }
      }
    })
  }

  const appendAnomalies = (gameId: string, inputs: readonly GameAnomalyInput[]) => {
    const game = games.find((candidate) => candidate.id === gameId)
    if (!game || inputs.length === 0) return

    let changed = false

    for (const input of inputs) {
      const duplicate = game.anomalies.some(
        (anomaly) =>
          anomaly.subsystem === input.subsystem &&
          anomaly.stage === input.stage &&
          anomaly.code === input.code &&
          anomaly.moveNumber === input.moveNumber &&
          anomaly.positionKey === input.positionKey,
      )
      if (duplicate) continue

      game.anomalies.push({
        ...structuredClone(input),
        id: `${gameId}:anomaly:${game.anomalies.length + 1}`,
        occurredAt: now(),
        message: sanitize(input.message),
        evidence: input.evidence?.slice(0, 12).map(sanitize),
        fingerprint: `${input.subsystem}:${input.stage}:${input.code}`,
        unexpected: true,
      })
      changed = true
    }

    if (!changed) return
    persist()
    if (game.status !== 'active') scheduleRetrospective(game)
  }

  return {
    async load() {
      let recovered = false
      const loadedGames = structuredClone(await storage.load()).map((game) => {
        if (game.status === 'active') recovered = true
        return {
          ...game,
          status: game.status === 'active' ? ('interrupted' as const) : game.status,
          ...(game.status === 'active' ? { interruptionReason: 'page-reload' } : {}),
          aiDecisions: game.aiDecisions ?? [],
          aiDiagnostics: game.aiDiagnostics ?? [],
          anomalies: game.anomalies ?? [],
        }
      })
      games = [...new Map([...loadedGames, ...games].map((game) => [game.id, game])).values()]
      if (recovered) persist()
    },
    startGame(input: { humanPlayer: Player; aiPlayer: Player }) {
      const gameId = id()
      games.push({
        id: gameId,
        schemaVersion: 1,
        status: 'active',
        startedAt: now(),
        humanPlayer: input.humanPlayer,
        aiPlayer: input.aiPlayer,
        boardSize: BOARD_SIZE,
        moves: [],
        aiDecisions: [],
        aiDiagnostics: [],
        anomalies: [],
      })
      persist()
      return gameId
    },
    recordMove(gameId: string, move: Move & { phase: string }) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game || game.status !== 'active') return
      game.moves.push({
        ...move,
        id: `${gameId}:move:${game.moves.length + 1}`,
        occurredAt: now(),
      })
      persist()
    },
    recordAIDecision(gameId: string, decision: AIDecisionRecord, move?: Move) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game || game.status !== 'active') return

      const linkedMove = move
        ? [...game.moves]
            .reverse()
            .find(
              (candidate) =>
                candidate.revertedAt === undefined &&
                candidate.turn === move.turn &&
                candidate.player === move.player &&
                candidate.row === move.row &&
                candidate.col === move.col,
            )
        : undefined

      game.aiDecisions.push({
        ...structuredClone(decision),
        id: decision.id ?? `${gameId}:decision:${game.aiDecisions.length + 1}`,
        occurredAt: decision.occurredAt ?? now(),
        ...(linkedMove ? { moveId: linkedMove.id, moveNumber: linkedMove.turn } : {}),
      })
      persist()
    },
    recordAIDiagnostic(gameId: string, diagnostic: GomokuAIDiagnostic) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game || game.status !== 'active') return
      game.aiDiagnostics.push({
        ...structuredClone(diagnostic),
        ...(diagnostic.fallbackMessage
          ? { fallbackMessage: sanitize(diagnostic.fallbackMessage) }
          : {}),
        ...(diagnostic.failureDetail ? { failureDetail: sanitize(diagnostic.failureDetail) } : {}),
      })
      persist()
    },
    saveReviewSummary(gameId: string, summary: ReviewSummary) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game) return
      game.reviewSummary = structuredClone(summary)
      persist()
    },
    recordAnomaly(gameId: string, input: GameAnomalyInput) {
      appendAnomalies(gameId, [input])
    },
    recordAnomalies(gameId: string, inputs: readonly GameAnomalyInput[]) {
      appendAnomalies(gameId, inputs)
    },
    setAgentPostmortem(gameId: string, state: AgentPostmortemState) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game) return
      game.agentPostmortem = structuredClone(state)
      persist()
    },
    queryAnomalies(
      input: { subsystem?: string; stage?: string; fingerprint?: string; limit?: number } = {},
    ): HistoricalAnomalySummary {
      const limit = Math.max(1, Math.min(input.limit ?? 5, 10))
      const matches = games
        .flatMap((game) =>
          game.anomalies.map((anomaly) => ({
            anomaly,
            lessons: game.retrospective?.status === 'completed' ? game.retrospective.lessons : [],
          })),
        )
        .filter(
          ({ anomaly }) =>
            (!input.subsystem || anomaly.subsystem === input.subsystem) &&
            (!input.stage || anomaly.stage === input.stage) &&
            (!input.fingerprint || anomaly.fingerprint === input.fingerprint),
        )
      const grouped = new Map<
        string,
        { fingerprint: string; count: number; lastSeenAt: number; lessons: string[] }
      >()
      for (const { anomaly, lessons } of matches) {
        const group = grouped.get(anomaly.fingerprint) ?? {
          fingerprint: anomaly.fingerprint,
          count: 0,
          lastSeenAt: 0,
          lessons: [],
        }
        group.count += 1
        group.lastSeenAt = Math.max(group.lastSeenAt, anomaly.occurredAt)
        group.lessons = [...new Set([...group.lessons, ...lessons])].slice(0, 6)
        grouped.set(anomaly.fingerprint, group)
      }
      return structuredClone({
        advisory: true as const,
        groups: [...grouped.values()]
          .sort(
            (left, right) =>
              right.count - left.count ||
              right.lastSeenAt - left.lastSeenAt ||
              left.fingerprint.localeCompare(right.fingerprint),
          )
          .slice(0, limit),
        examples: matches
          .map(({ anomaly }) => anomaly)
          .sort(
            (left, right) => right.occurredAt - left.occurredAt || left.id.localeCompare(right.id),
          )
          .slice(0, limit),
      })
    },
    revertMovesAfter(gameId: string, activeMoveCount: number, reason: string) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game || game.status !== 'active') return
      const revertedAt = now()
      for (const move of game.moves
        .filter((candidate) => !candidate.revertedAt)
        .slice(activeMoveCount)) {
        move.revertedAt = revertedAt
        move.revertReason = reason
      }
      persist()
    },
    interruptGame(gameId: string, reason: string) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game || game.status !== 'active') return
      game.status = 'interrupted'
      game.interruptionReason = reason
      game.finishedAt = now()
      persist()
      scheduleRetrospective(game)
    },
    finishGame(gameId: string, result: Exclude<GameResult, null>) {
      const game = games.find((candidate) => candidate.id === gameId)
      if (!game || game.status !== 'active') return
      game.status = 'completed'
      game.result = result
      game.finishedAt = now()
      persist()
      scheduleRetrospective(game)
    },
    getGames: () => structuredClone(games),
    flush: async () => writes,
  }
}

export interface AIDecisionRecord {
  id?: string
  moveId?: string
  moveNumber?: number
  occurredAt?: number
  positionKey: string
  selectedMove: { row: number; col: number }
  searchScore?: number
  localBestMove?: { row: number; col: number }
  localBestScore?: number
  source: DecisionSource
}

export type SessionGameRecord = GameHistoryRecord

const HISTORY_DATABASE = 'gomoku-game-history'
const HISTORY_STORE = 'history'
const HISTORY_KEY = 'games'

export function createIndexedDbGameHistoryStorage(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): GameHistoryStorage {
  if (!factory) return { load: async () => [], save: async () => undefined }
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(HISTORY_DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(HISTORY_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return {
    async load() {
      const db = await database
      return new Promise<GameHistoryRecord[]>((resolve, reject) => {
        const request = db.transaction(HISTORY_STORE).objectStore(HISTORY_STORE).get(HISTORY_KEY)
        request.onsuccess = () =>
          resolve(Array.isArray(request.result) ? request.result.filter(isGameHistoryRecord) : [])
        request.onerror = () => reject(request.error)
      })
    },
    async save(records) {
      const db = await database
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE, 'readwrite')
        // ponytail: one snapshot keeps ordering simple; split per game if history size becomes measurable.
        transaction.objectStore(HISTORY_STORE).put(structuredClone(records), HISTORY_KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
  }
}

export function createHttpGameHistoryStorage(
  fetcher: typeof globalThis.fetch | undefined = globalThis.fetch,
  endpoint = '/api/history/games',
): GameHistoryStorage {
  if (!fetcher) {
    return {
      load: async () => [],
      save: async () => undefined,
    }
  }

  return {
    async load() {
      const response = await fetcher(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`SQLite 历史读取失败（HTTP ${response.status}）`)
      }

      const payload: unknown = await response.json()

      if (
        !payload ||
        typeof payload !== 'object' ||
        !Array.isArray((payload as { games?: unknown }).games)
      ) {
        throw new Error('SQLite 历史响应格式无效')
      }

      return (payload as { games: unknown[] }).games.filter(isGameHistoryRecord)
    },

    async save(records) {
      const response = await fetcher(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games: records }),
      })

      if (!response.ok) {
        throw new Error(`SQLite 历史保存失败（HTTP ${response.status}）`)
      }
    },
  }
}

export function createMirroredGameHistoryStorage(
  primary: GameHistoryStorage,
  cache: GameHistoryStorage,
): GameHistoryStorage {
  return {
    async load() {
      const [primaryResult, cacheResult] = await Promise.allSettled([primary.load(), cache.load()])

      const primaryGames = primaryResult.status === 'fulfilled' ? primaryResult.value : []
      const cachedGames = cacheResult.status === 'fulfilled' ? cacheResult.value : []

      const merged = [
        ...new Map([...cachedGames, ...primaryGames].map((game) => [game.id, game])).values(),
      ]

      if (merged.length > 0) {
        await Promise.allSettled([
          primary.save(structuredClone(merged)),
          cache.save(structuredClone(merged)),
        ])
      }

      return merged
    },

    async save(records) {
      const results = await Promise.allSettled([primary.save(records), cache.save(records)])

      if (results.every((result) => result.status === 'rejected')) {
        const firstError = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )

        throw firstError?.reason instanceof Error
          ? firstError.reason
          : new Error('棋局历史保存失败')
      }
    },
  }
}

function isGameHistoryRecord(value: unknown): value is GameHistoryRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<GameHistoryRecord>
  return (
    record.schemaVersion === 1 &&
    typeof record.id === 'string' &&
    typeof record.startedAt === 'number' &&
    ['active', 'completed', 'interrupted'].includes(String(record.status)) &&
    Array.isArray(record.moves)
  )
}

function legacySessionGames(): GameHistoryRecord[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SESSION_EXPERIENCE_KEY) ?? 'null')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value) => {
      if (!value || typeof value !== 'object') return []
      const legacy = value as {
        id?: unknown
        startedAt?: unknown
        finishedAt?: unknown
        result?: unknown
        moves?: unknown
        aiDecisions?: unknown
        aiPlayer?: unknown
        reviewSummary?: unknown
      }
      if (
        typeof legacy.id !== 'string' ||
        typeof legacy.startedAt !== 'number' ||
        !Array.isArray(legacy.moves) ||
        !Array.isArray(legacy.aiDecisions)
      )
        return []
      const aiPlayer: Player = legacy.aiPlayer === 1 ? 1 : 2
      const result = ['blackWin', 'whiteWin', 'draw'].includes(String(legacy.result))
        ? (legacy.result as Exclude<GameResult, null>)
        : undefined
      return [
        {
          id: legacy.id,
          schemaVersion: 1,
          status: result ? 'completed' : 'interrupted',
          startedAt: legacy.startedAt,
          ...(typeof legacy.finishedAt === 'number' ? { finishedAt: legacy.finishedAt } : {}),
          ...(result ? { result } : { interruptionReason: 'legacy-incomplete' }),
          humanPlayer: aiPlayer === 1 ? 2 : 1,
          aiPlayer,
          boardSize: BOARD_SIZE,
          legacy: true,
          incomplete: true,
          moves: legacy.moves.map((move, index) => ({
            ...(move as Move),
            id: `${legacy.id}:legacy-move:${index + 1}`,
            phase: 'legacy',
          })),
          aiDecisions: structuredClone(legacy.aiDecisions as AIDecisionRecord[]),
          aiDiagnostics: [],
          anomalies: [],
          ...(legacy.reviewSummary
            ? { reviewSummary: structuredClone(legacy.reviewSummary as ReviewSummary) }
            : {}),
        } satisfies GameHistoryRecord,
      ]
    })
  } catch {
    return []
  }
}

async function requestGameAnomalyReview(game: GameHistoryRecord): Promise<GameAnomalyReview> {
  const data = await postJson(
    '/api/gomoku/anomaly-review',
    {
      game: {
        id: game.id,
        status: game.status,
        result: game.result,
        anomalies: game.anomalies,
        aiDiagnostics: game.aiDiagnostics,
      },
    },
    '异常复盘请求失败',
    AbortSignal.timeout(10_000),
  )
  if (!data || typeof data !== 'object') throw new Error('异常复盘格式无效')
  const review = data as Partial<GameAnomalyReview>
  if (
    typeof review.summary !== 'string' ||
    !Array.isArray(review.anomalyIds) ||
    !review.anomalyIds.every((item) => typeof item === 'string') ||
    !Array.isArray(review.lessons) ||
    !review.lessons.every((item) => typeof item === 'string') ||
    !Array.isArray(review.followUps) ||
    !review.followUps.every((item) => typeof item === 'string')
  )
    throw new Error('异常复盘格式无效')
  return review as GameAnomalyReview
}

const indexedDbStorage = createIndexedDbGameHistoryStorage()
const sqliteStorage = createHttpGameHistoryStorage()
const durableHistoryStorage = createMirroredGameHistoryStorage(sqliteStorage, indexedDbStorage)

const defaultHistory = createGameHistoryService({
  storage: {
    async load() {
      const persisted = await durableHistoryStorage.load()
      const merged = new Map([...persisted, ...legacySessionGames()].map((game) => [game.id, game]))
      const records = [...merged.values()]

      if (records.length > 0) {
        await durableHistoryStorage.save(records).catch(() => undefined)
      }

      return records
    },
    save: (games) => durableHistoryStorage.save(games),
  },
  reviewAnomalies: requestGameAnomalyReview,
})
void defaultHistory.load().catch(() => undefined)
let sessionExperienceGameIds: Set<string> | null = null

export function createPositionKey(board: Board, currentPlayer: 1 | 2) {
  return `${board.map((line) => line.join('')).join('')}|${currentPlayer}`
}

export function startSessionGame(initialMoves: Move[] = [], aiPlayer: Player = 2) {
  const gameId = defaultHistory.startGame({
    aiPlayer,
    humanPlayer: aiPlayer === 1 ? 2 : 1,
  })
  for (const move of initialMoves) defaultHistory.recordMove(gameId, { ...move, phase: 'restored' })
  sessionExperienceGameIds?.add(gameId)
  return gameId
}

export function recordAIDecision(gameId: string, decision: AIDecisionRecord, moves: Move[]) {
  defaultHistory.recordAIDecision(gameId, decision, moves[moves.length - 1])
}

export function finishSessionGame(
  gameId: string,
  result: Exclude<GameResult, null>,
  moves: Move[],
) {
  void moves
  defaultHistory.finishGame(gameId, result)
}

export function discardUnfinishedGame(gameId: string) {
  defaultHistory.interruptGame(gameId, 'restart')
}

export function removeSessionGame(gameId: string) {
  defaultHistory.interruptGame(gameId, 'replaced')
}

export function saveReviewSummary(gameId: string, summary: ReviewSummary) {
  defaultHistory.saveReviewSummary(gameId, summary)
}

export function getSessionReviewHistorySummary(): SessionReviewHistorySummary {
  const summaries = defaultHistory
    .getGames()
    .flatMap((record) =>
      (!sessionExperienceGameIds || sessionExperienceGameIds.has(record.id)) && record.reviewSummary
        ? [record.reviewSummary]
        : [],
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
  const related = defaultHistory.getGames().flatMap((game) => {
    if (!game.result || (sessionExperienceGameIds && !sessionExperienceGameIds.has(game.id))) {
      return []
    }

    const activeMoveIds = new Set(
      game.moves.filter((move) => move.revertedAt === undefined).map((move) => move.id),
    )

    return game.aiDecisions
      .filter(
        (decision) =>
          decision.positionKey === positionKey &&
          (decision.moveId === undefined || activeMoveIds.has(decision.moveId)),
      )
      .map((decision) => ({ game, decision }))
  })
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
  source: DecisionSource,
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

function postmortemFindingAsAnomaly(finding: AgentPostmortemFinding): GameAnomalyInput {
  return {
    subsystem: 'agent_learning',
    stage: 'postgame_analysis',
    code: finding.code,
    message: finding.message,
    moveNumber: finding.moveNumber,
    recoverable: false,
    severity: finding.severity,
    evidence: [...finding.evidence],
    positionKey: finding.positionKey,
    selectedMove: { ...finding.selectedMove },
    ...(finding.recommendedMove ? { recommendedMove: { ...finding.recommendedMove } } : {}),
  }
}

export async function runSessionAgentPostmortem(gameId: string) {
  const game = defaultHistory.getGames().find((record) => record.id === gameId)
  if (!game || game.status !== 'completed') return
  if (game.agentPostmortem?.status === 'pending' || game.agentPostmortem?.status === 'completed') {
    return
  }

  const startedAt = Date.now()
  defaultHistory.setAgentPostmortem(gameId, {
    status: 'pending',
    version: 1,
    startedAt,
  })

  try {
    const activeMoveIds = new Set(
      game.moves.filter((move) => move.revertedAt === undefined).map((move) => move.id),
    )
    const findings = await analyzeAgentPostmortemInWorker({
      aiPlayer: game.aiPlayer,
      result: game.result,
      moves: game.moves.map((move) => ({ ...move })),
      aiDecisions: game.aiDecisions
        .filter((decision) => decision.moveId === undefined || activeMoveIds.has(decision.moveId))
        .map((decision) => structuredClone(decision)),
      aiDiagnostics: game.aiDiagnostics.map((diagnostic) => structuredClone(diagnostic)),
    })

    defaultHistory.recordAnomalies(gameId, findings.map(postmortemFindingAsAnomaly))
    defaultHistory.setAgentPostmortem(gameId, {
      status: 'completed',
      version: 1,
      startedAt,
      completedAt: Date.now(),
      findingCount: findings.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent 局后分析失败'
    defaultHistory.setAgentPostmortem(gameId, {
      status: 'failed',
      version: 1,
      startedAt,
      completedAt: Date.now(),
      error: message,
    })
    defaultHistory.recordAnomaly(gameId, {
      subsystem: 'agent_learning',
      stage: 'postgame_analysis',
      code: 'agent_postmortem_failed',
      message,
      recoverable: true,
      fallbackAction: 'retain-game-history',
    })
  }
}

export function clearSessionExperience() {
  sessionExperienceGameIds = new Set()
}

export function reloadSessionExperience() {
  return defaultHistory.load()
}

export function getSessionGames() {
  return defaultHistory.getGames()
}

export const recordGameMove = (gameId: string, move: Move & { phase: string }) =>
  defaultHistory.recordMove(gameId, move)
export const recordGameAnomaly = (gameId: string, anomaly: GameAnomalyInput) =>
  defaultHistory.recordAnomaly(gameId, anomaly)
export const recordAIDiagnostic = (gameId: string, diagnostic: GomokuAIDiagnostic) =>
  defaultHistory.recordAIDiagnostic(gameId, diagnostic)
export const interruptSessionGame = (gameId: string, reason: string) =>
  defaultHistory.interruptGame(gameId, reason)
export const revertSessionMovesAfter = (gameId: string, moveCount: number) =>
  defaultHistory.revertMovesAfter(gameId, moveCount, 'undo')
export const getHistoricalAnomalies = (limit = 5) => defaultHistory.queryAnomalies({ limit })
export const flushGameHistory = () => defaultHistory.flush()
