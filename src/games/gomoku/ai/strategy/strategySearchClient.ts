import type { ThreatSearchOptions, ThreatSearchResult } from '@/games/gomoku/ai/threatSearch'
import type { StrategySearchRequest, StrategySearchResponse } from '@/games/gomoku/ai/strategy/strategySearch.worker'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

let nextId = 1

function executeThreatWorker(
  board: Board,
  player: Player,
  move: { row: number; col: number } | undefined,
  options: ThreatSearchOptions,
  signal: AbortSignal,
): Promise<ThreatSearchResult> {
  const worker = new Worker(new URL('./strategySearch.worker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal.removeEventListener('abort', abort); worker.terminate() }
    const abort = () => { cleanup(); reject(new DOMException('威胁搜索已取消', 'AbortError')) }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    worker.addEventListener('message', (event: MessageEvent<StrategySearchResponse>) => {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error))
    })
    worker.addEventListener('error', () => { cleanup(); reject(new Error('威胁搜索 Worker 执行失败')) }, { once: true })
    worker.postMessage({ id, board: board.map((line) => [...line]), player, ...(move ? { move: { ...move } } : {}), options } satisfies StrategySearchRequest)
  })
}

export function searchForcedWinInWorker(board: Board, player: Player, options: ThreatSearchOptions, signal: AbortSignal) {
  return executeThreatWorker(board, player, undefined, options, signal)
}

export function searchForcedWinFromMoveInWorker(board: Board, player: Player, move: { row: number; col: number }, options: ThreatSearchOptions, signal: AbortSignal) {
  return executeThreatWorker(board, player, move, options, signal)
}
