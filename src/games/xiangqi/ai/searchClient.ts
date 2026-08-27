import type { XiangqiSearchOptions, XiangqiSearchResult } from '@/games/xiangqi/ai/search'
import type { XiangqiSearchWorkerRequest, XiangqiSearchWorkerResponse } from '@/games/xiangqi/ai/search.worker'
import { cloneXiangqiHistory } from '@/games/xiangqi/core/history'
import type { XiangqiBoard, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

let requestId = 0
export function searchXiangqiInWorker(board: XiangqiBoard, side: XiangqiSide, options: Omit<XiangqiSearchOptions, 'shouldAbort'>, signal?: AbortSignal): Promise<XiangqiSearchResult> {
  const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
  const id = ++requestId
  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate()
    signal?.addEventListener('abort', () => { finish(); reject(new DOMException('已取消象棋搜索', 'AbortError')) }, { once: true })
    worker.addEventListener('message', (event: MessageEvent<XiangqiSearchWorkerResponse>) => {
      if (event.data.id !== id) return
      finish()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error))
    })
    worker.addEventListener('error', (event) => { finish(); reject(new Error(event.message)) }, { once: true })
    const request: XiangqiSearchWorkerRequest = {
      id,
      board: board.map((row) => row.map((piece) => piece ? { ...piece } : null)),
      side,
      options: {
        maxDepth: options.maxDepth,
        timeBudgetMs: options.timeBudgetMs,
        positionHistory: options.positionHistory ? cloneXiangqiHistory(options.positionHistory) : undefined,
        mustChangeSide: options.mustChangeSide,
      },
    }
    worker.postMessage(request)
  })
}
