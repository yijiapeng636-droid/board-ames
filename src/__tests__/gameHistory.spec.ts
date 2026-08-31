import { describe, expect, it } from 'vitest'
import {
  createGameHistoryService,
  type GameHistoryRecord,
  type GameHistoryStorage,
} from '@/games/gomoku/ai/sessionExperience'

function memoryStorage(): GameHistoryStorage {
  let records: GameHistoryRecord[] = []
  return {
    load: async () => structuredClone(records),
    save: async (next) => {
      records = structuredClone(next)
    },
  }
}

describe('persistent Gomoku game history', () => {
  it('does not overwrite a newly started game when storage finishes loading late', async () => {
    let releaseLoad!: (records: GameHistoryRecord[]) => void
    const storage: GameHistoryStorage = {
      load: () => new Promise((resolve) => (releaseLoad = resolve)),
      save: async () => undefined,
    }
    const history = createGameHistoryService({ storage, now: () => 50, id: () => 'new-game' })

    const loading = history.load()
    history.startGame({ humanPlayer: 1, aiPlayer: 2 })
    releaseLoad([])
    await loading

    expect(history.getGames()).toEqual([
      expect.objectContaining({ id: 'new-game', status: 'active' }),
    ])
  })

  it('keeps a completed game after the service is recreated', async () => {
    const storage = memoryStorage()
    const first = createGameHistoryService({ storage, now: () => 100, id: () => 'game-1' })
    await first.load()

    const gameId = first.startGame({ humanPlayer: 1, aiPlayer: 2 })
    first.recordMove(gameId, {
      turn: 1,
      player: 1,
      row: 7,
      col: 7,
      phase: 'playerTurn',
    })
    first.finishGame(gameId, 'blackWin')
    await first.flush()

    const second = createGameHistoryService({ storage, now: () => 200, id: () => 'unused' })
    await second.load()

    expect(second.getGames()).toEqual([
      expect.objectContaining({
        id: 'game-1',
        schemaVersion: 1,
        status: 'completed',
        result: 'blackWin',
        humanPlayer: 1,
        aiPlayer: 2,
        moves: [expect.objectContaining({ turn: 1, player: 1, row: 7, col: 7 })],
      }),
    ])
  })

  it('keeps interrupted and reverted play in the audit history', async () => {
    let timestamp = 100
    const history = createGameHistoryService({
      storage: memoryStorage(),
      now: () => timestamp++,
      id: () => 'game-2',
    })
    await history.load()
    const gameId = history.startGame({ humanPlayer: 2, aiPlayer: 1 })
    history.recordMove(gameId, { turn: 1, player: 1, row: 7, col: 7, phase: 'aiThinking' })
    history.revertMovesAfter(gameId, 0, 'undo')
    history.interruptGame(gameId, 'restart')

    expect(history.getGames()[0]).toMatchObject({
      status: 'interrupted',
      interruptionReason: 'restart',
      moves: [{ row: 7, col: 7, revertReason: 'undo', revertedAt: 102 }],
    })
  })

  it('returns bounded and sanitized anomaly history as advisory evidence', async () => {
    const history = createGameHistoryService({
      storage: memoryStorage(),
      now: () => 300,
      id: () => 'game-3',
    })
    await history.load()
    const gameId = history.startGame({ humanPlayer: 1, aiPlayer: 2 })
    history.recordAnomaly(gameId, {
      subsystem: 'agent',
      stage: 'model_request',
      code: 'model_timeout',
      message: 'Authorization: Bearer secret-token',
      moveNumber: 2,
      recoverable: true,
      fallbackAction: 'local-search',
    })

    expect(history.queryAnomalies({ subsystem: 'agent', limit: 1 })).toEqual({
      advisory: true,
      groups: [
        expect.objectContaining({
          fingerprint: 'agent:model_request:model_timeout',
          count: 1,
          lastSeenAt: 300,
        }),
      ],
      examples: [
        expect.objectContaining({
          code: 'model_timeout',
          message: '[redacted]',
          fallbackAction: 'local-search',
        }),
      ],
    })
  })

  it('reviews anomalies once after the terminal game is saved', async () => {
    let reviewCalls = 0
    const history = createGameHistoryService({
      storage: memoryStorage(),
      now: () => 400,
      id: () => 'game-4',
      reviewAnomalies: async (game) => {
        reviewCalls += 1
        expect(game.status).toBe('completed')
        return {
          summary: '模型超时后本地搜索成功接管。',
          anomalyIds: [game.anomalies[0]!.id],
          lessons: ['保留本地搜索回退。'],
          followUps: ['监控模型请求耗时。'],
        }
      },
    })
    await history.load()
    const gameId = history.startGame({ humanPlayer: 1, aiPlayer: 2 })
    history.recordAnomaly(gameId, {
      subsystem: 'agent',
      stage: 'model_request',
      code: 'model_timeout',
      message: 'timeout',
      recoverable: true,
      fallbackAction: 'local-search',
    })
    history.finishGame(gameId, 'whiteWin')
    history.finishGame(gameId, 'whiteWin')
    await history.flush()

    expect(reviewCalls).toBe(1)
    expect(history.getGames()[0]).toMatchObject({
      status: 'completed',
      retrospective: {
        status: 'completed',
        summary: '模型超时后本地搜索成功接管。',
        lessons: ['保留本地搜索回退。'],
      },
    })
    expect(history.queryAnomalies().groups[0]).toMatchObject({
      fingerprint: 'agent:model_request:model_timeout',
      lessons: ['保留本地搜索回退。'],
    })
  })

  it('reviews an anomaly that arrives after a terminal result', async () => {
    let reviewCalls = 0
    const history = createGameHistoryService({
      storage: memoryStorage(),
      now: () => 500,
      id: () => 'game-5',
      reviewAnomalies: async (game) => {
        reviewCalls += 1
        return {
          summary: 'late diagnostic reviewed',
          anomalyIds: [game.anomalies[0]!.id],
          lessons: ['persist terminal diagnostics'],
          followUps: [],
        }
      },
    })
    await history.load()
    const gameId = history.startGame({ humanPlayer: 1, aiPlayer: 2 })
    history.finishGame(gameId, 'draw')
    history.recordAnomaly(gameId, {
      subsystem: 'review',
      stage: 'terminal_review',
      code: 'late_failure',
      message: 'review failed after game completion',
      recoverable: true,
      fallbackAction: 'local-summary',
    })
    await history.flush()

    expect(reviewCalls).toBe(1)
    expect(history.getGames()[0]?.retrospective).toMatchObject({
      status: 'completed',
      summary: 'late diagnostic reviewed',
    })
  })
})
