import type { SearchWorkerRequest, SearchWorkerResponse } from '@/games/gomoku/ai/search.worker'
import type { SearchOptions } from '@/games/gomoku/ai/search'
import type { Board, FixedCandidateSearchResult, Player, SearchResult } from '@/games/gomoku/types/gomoku'
import { postWorkerData } from '@/workerData'

let nextRequestId = 1

type WorkerRequestWithoutId =
  | { kind: 'root'; board: Board; options?: SearchOptions }
  | { kind: 'fixed'; board: Board; move: { row: number; col: number }; rootPlayer: Player; options?: SearchOptions }

function executeWorker(request: WorkerRequestWithoutId, signal?: AbortSignal): Promise<SearchWorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    const id = nextRequestId++
    const cleanup = () => { signal?.removeEventListener('abort', abort); worker.terminate() }
    const abort = () => { cleanup(); reject(new DOMException('搜索已取消', 'AbortError')) }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    worker.addEventListener('error', () => { cleanup(); reject(new Error('搜索 Worker 执行失败')) }, { once: true })
    worker.addEventListener('message', (event: MessageEvent<SearchWorkerResponse>) => {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data)
      else reject(new Error(event.data.error))
    })
    const payload = { ...request, id, board: request.board.map((line) => [...line]) } satisfies SearchWorkerRequest
    try {
      postWorkerData(worker, payload, '五子棋搜索')
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

export async function searchAIMoves(board: Board, signal?: AbortSignal, options?: SearchOptions): Promise<SearchResult> {
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
  const response = await executeWorker({ kind: 'fixed', board, move: { ...move }, rootPlayer, options }, signal)
  if (!response.ok || response.kind !== 'fixed') throw new Error('固定候选 Worker 返回类型错误')
  return response.result
}
