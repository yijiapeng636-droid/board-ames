import type { ReviewWorkerRequest, ReviewWorkerResponse } from '@/games/gomoku/ai/review.worker'
import type { Move, Player, ReviewPoint } from '@/games/gomoku/types/gomoku'
import { requestWorker } from '@/workerData'

export function analyzeReview(
  moves: Move[],
  humanPlayer: Player,
  signal?: AbortSignal,
): Promise<ReviewPoint[]> {
  const request: Omit<ReviewWorkerRequest, 'id'> = {
    moves: moves.map((move) => ({ ...move })),
    humanPlayer,
  }
  return requestWorker<ReviewWorkerRequest, ReviewWorkerResponse>(
    new URL('./review.worker.ts', import.meta.url),
    request,
    '五子棋复盘',
    signal,
  ).then((response) => {
    if (!response.ok) throw new Error(response.error)
    return response.points
  })
}
