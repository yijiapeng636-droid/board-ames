import type { SearchWorkerRequest, SearchWorkerResponse } from '@/games/gomoku/ai/search.worker'
import type { SearchOptions } from '@/games/gomoku/ai/search'
import type {
  Board,
  FixedCandidateSearchResult,
  Player,
  SearchResult,
} from '@/games/gomoku/types/gomoku'
import { requestWorker } from '@/workerData'

type WorkerRequestWithoutId =
  | { kind: 'root'; board: Board; options?: SearchOptions }
  | {
      kind: 'fixed'
      board: Board
      move: { row: number; col: number }
      rootPlayer: Player
      options?: SearchOptions
    }

function executeWorker(
  request: WorkerRequestWithoutId,
  signal?: AbortSignal,
): Promise<SearchWorkerResponse> {
  const payload = {
    ...request,
    board: request.board.map((line) => [...line]),
  } satisfies WorkerRequestWithoutId
  return requestWorker<SearchWorkerRequest, SearchWorkerResponse>(
    new URL('./search.worker.ts', import.meta.url),
    payload,
    '五子棋搜索',
    signal,
  ).then((response) => {
    if (!response.ok) throw new Error(response.error)
    return response
  })
}

export async function searchAIMoves(
  board: Board,
  signal?: AbortSignal,
  options?: SearchOptions,
): Promise<SearchResult> {
  const response = await executeWorker({ kind: 'root', board, options }, signal)
  if (!response.ok || response.kind !== 'root') throw new Error('搜索 Worker 返回类型错误')
  return response.result
}

export async function searchFixedCandidateInWorker(
  board: Board,
  move: { row: number; col: number },
  rootPlayer: Player,
  options: SearchOptions,
  signal: AbortSignal,
): Promise<FixedCandidateSearchResult> {
  const response = await executeWorker(
    { kind: 'fixed', board, move: { ...move }, rootPlayer, options },
    signal,
  )
  if (!response.ok || response.kind !== 'fixed') throw new Error('固定候选 Worker 返回类型错误')
  return response.result
}
