import type { XiangqiSearchOptions, XiangqiSearchResult } from '@/games/xiangqi/ai/search'
import type {
  XiangqiSearchWorkerRequest,
  XiangqiSearchWorkerResponse,
} from '@/games/xiangqi/ai/search.worker'
import { cloneXiangqiHistory } from '@/games/xiangqi/core/history'
import type { XiangqiBoard, XiangqiSide } from '@/games/xiangqi/types/xiangqi'
import { requestWorker } from '@/workerData'

export function searchXiangqiInWorker(
  board: XiangqiBoard,
  side: XiangqiSide,
  options: Omit<XiangqiSearchOptions, 'shouldAbort'>,
  signal?: AbortSignal,
): Promise<XiangqiSearchResult> {
  const request: Omit<XiangqiSearchWorkerRequest, 'id'> = {
    board: board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
    side,
    options: {
      maxDepth: options.maxDepth,
      timeBudgetMs: options.timeBudgetMs,
      positionHistory: options.positionHistory
        ? cloneXiangqiHistory(options.positionHistory)
        : undefined,
      mustChangeSide: options.mustChangeSide,
    },
  }
  return requestWorker<XiangqiSearchWorkerRequest, XiangqiSearchWorkerResponse>(
    new URL('./search.worker.ts', import.meta.url),
    request,
    '象棋搜索',
    signal,
  ).then((response) => {
    if (!response.ok) throw new Error(response.error)
    return response.result
  })
}
