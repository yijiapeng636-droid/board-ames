import type { XiangqiReviewPoint } from '@/games/xiangqi/ai/review'
import type { XiangqiReviewWorkerRequest, XiangqiReviewWorkerResponse } from '@/games/xiangqi/ai/review.worker'
import type { XiangqiBoard, XiangqiMove, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

let id = 0
export function analyzeXiangqiReviewInWorker(initialBoard: XiangqiBoard, moves: XiangqiMove[], humanSide: XiangqiSide, signal?: AbortSignal): Promise<XiangqiReviewPoint[]> {
  const worker = new Worker(new URL('./review.worker.ts', import.meta.url), { type: 'module' })
  const requestId = ++id
  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate()
    signal?.addEventListener('abort', () => { finish(); reject(new DOMException('已取消复盘', 'AbortError')) }, { once: true })
    worker.addEventListener('message', (event: MessageEvent<XiangqiReviewWorkerResponse>) => {
      if (event.data.id !== requestId) return
      finish()
      if (event.data.ok) resolve(event.data.points)
      else reject(new Error(event.data.error))
    })
    worker.postMessage({ id: requestId, initialBoard, moves, humanSide } satisfies XiangqiReviewWorkerRequest)
  })
}
