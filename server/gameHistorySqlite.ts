import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { Plugin, ViteDevServer, PreviewServer } from 'vite'

const MAX_BODY_BYTES = 5_000_000

interface GameHistorySqliteOptions {
  databasePath?: string
}

interface StoredGameRecord {
  id: string
  schemaVersion: number
  status: string
  startedAt: number
  finishedAt?: number
  payload: unknown
}

interface HistoryPayload {
  games: unknown[]
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length

    if (size > MAX_BODY_BYTES) {
      throw new Error('棋局历史请求内容过大')
    }

    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return null
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function parseRecord(value: unknown): StoredGameRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('棋局记录必须是对象')
  }

  const record = value as Record<string, unknown>

  if (
    typeof record.id !== 'string' ||
    record.id.length === 0 ||
    typeof record.schemaVersion !== 'number' ||
    typeof record.status !== 'string' ||
    typeof record.startedAt !== 'number'
  ) {
    throw new Error('棋局记录缺少必要字段')
  }

  if (
    record.finishedAt !== undefined &&
    typeof record.finishedAt !== 'number'
  ) {
    throw new Error('finishedAt 格式无效')
  }

  return {
    id: record.id,
    schemaVersion: record.schemaVersion,
    status: record.status,
    startedAt: record.startedAt,
    ...(typeof record.finishedAt === 'number'
      ? { finishedAt: record.finishedAt }
      : {}),
    payload: value,
  }
}

function parseHistoryPayload(value: unknown): HistoryPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('棋局历史请求必须是对象')
  }

  const payload = value as Record<string, unknown>

  if (!Array.isArray(payload.games)) {
    throw new Error('games 必须是数组')
  }

  payload.games.forEach(parseRecord)

  return { games: payload.games }
}

export interface SqliteGameHistoryDatabase {
  load(): unknown[]
  save(records: readonly unknown[]): void
  close(): void
}

export function createSqliteGameHistoryDatabase(
  databasePath = './data/gomoku.sqlite',
): SqliteGameHistoryDatabase {
  const resolvedPath =
    databasePath === ':memory:' ? databasePath : resolve(databasePath)

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  const database = new DatabaseSync(resolvedPath)

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS game_history_records (
      id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_game_history_started_at
      ON game_history_records(started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_game_history_status
      ON game_history_records(status);
  `)

  const loadStatement = database.prepare(`
    SELECT payload_json
    FROM game_history_records
    ORDER BY started_at ASC, id ASC
  `)

  const upsertStatement = database.prepare(`
    INSERT INTO game_history_records (
      id,
      schema_version,
      status,
      started_at,
      finished_at,
      payload_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      schema_version = excluded.schema_version,
      status = excluded.status,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `)

  const saveTransaction = (records: readonly unknown[]) => {
    database.exec('BEGIN IMMEDIATE')

    try {
      const updatedAt = Date.now()

      for (const value of records) {
        const record = parseRecord(value)

        upsertStatement.run(
          record.id,
          record.schemaVersion,
          record.status,
          record.startedAt,
          record.finishedAt ?? null,
          JSON.stringify(record.payload),
          updatedAt,
        )
      }

      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  return {
    load() {
      return loadStatement.all().flatMap((row) => {
        const payloadJson = (row as { payload_json?: unknown }).payload_json

        if (typeof payloadJson !== 'string') {
          return []
        }

        try {
          return [JSON.parse(payloadJson) as unknown]
        } catch {
          return []
        }
      })
    },

    save(records) {
      saveTransaction(records)
    },

    close() {
      database.close()
    },
  }
}

function registerHistoryMiddleware(
  server: ViteDevServer | PreviewServer,
  databasePath: string,
) {
  const database = createSqliteGameHistoryDatabase(databasePath)

  server.middlewares.use('/api/history/games', async (request, response) => {
    try {
      if (request.method === 'GET') {
        sendJson(response, 200, { games: database.load() })
        return
      }

      if (request.method === 'PUT') {
        const payload = parseHistoryPayload(await readJson(request))
        database.save(payload.games)
        sendJson(response, 200, { saved: payload.games.length })
        return
      }

      sendJson(response, 405, { error: '仅支持 GET 和 PUT 请求' })
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error ? error.message : '棋局历史数据库请求失败',
      })
    }
  })

  server.httpServer?.once('close', () => {
    database.close()
  })
}

export function gameHistorySqlite(
  options: GameHistorySqliteOptions = {},
): Plugin {
  const databasePath = options.databasePath?.trim() || './data/gomoku.sqlite'

  return {
    name: 'local-game-history-sqlite',

    configureServer(server) {
      registerHistoryMiddleware(server, databasePath)
    },

    configurePreviewServer(server) {
      registerHistoryMiddleware(server, databasePath)
    },
  }
}
