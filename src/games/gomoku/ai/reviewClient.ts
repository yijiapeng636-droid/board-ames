import type { ReviewWorkerRequest, ReviewWorkerResponse } from '@/games/gomoku/ai/review.worker'
import type { Move, Player, ReviewPoint } from '@/games/gomoku/types/gomoku'
import { postWorkerData } from '@/workerData'

let nextRequestId = 1

export function analyzeReview(
  moves: Move[],
  humanPlayer: Player,
  signal?: AbortSignal,
): Promise<ReviewPoint[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./review.worker.ts', import.meta.url), { type: 'module' })
    const id = nextRequestId++
    const cleanup = () => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(new DOMException('复盘已取消', 'AbortError'))
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.addEventListener('error', () => {
      cleanup()
      reject(new Error('复盘 Worker 执行失败'))
    })
    worker.addEventListener('message', (event: MessageEvent<ReviewWorkerResponse>) => {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data.points)
      else reject(new Error(event.data.error))
    })
    const request: ReviewWorkerRequest = {
      id,
      moves: moves.map((move) => ({ ...move })),
      humanPlayer,
    }
    try {
      postWorkerData(worker, request, '五子棋复盘')
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
