import type { ThreatSearchOptions, ThreatSearchResult } from '@/games/gomoku/ai/threatSearch'
import type {
  StrategySearchRequest,
  StrategySearchResponse,
} from '@/games/gomoku/ai/strategy/strategySearch.worker'
import type { Board, Player } from '@/games/gomoku/types/gomoku'
import { requestWorker } from '@/workerData'

function executeThreatWorker(
  board: Board,
  player: Player,
  move: { row: number; col: number } | undefined,
  options: ThreatSearchOptions,
  signal: AbortSignal,
): Promise<ThreatSearchResult> {
  const request = {
    board,
    player,
    ...(move ? { move } : {}),
    options,
  } satisfies Omit<StrategySearchRequest, 'id'>
  return requestWorker<StrategySearchRequest, StrategySearchResponse>(
    new URL('./strategySearch.worker.ts', import.meta.url),
    request,
    '五子棋威胁搜索',
    signal,
  ).then((response) => {
    if (!response.ok) throw new Error(response.error)
    return response.result
  })
}

export function searchForcedWinInWorker(
  board: Board,
  player: Player,
  options: ThreatSearchOptions,
  signal: AbortSignal,
) {
  return executeThreatWorker(board, player, undefined, options, signal)
}

export function searchForcedWinFromMoveInWorker(
  board: Board,
  player: Player,
  move: { row: number; col: number },
  options: ThreatSearchOptions,
  signal: AbortSignal,
) {
  return executeThreatWorker(board, player, move, options, signal)
}
