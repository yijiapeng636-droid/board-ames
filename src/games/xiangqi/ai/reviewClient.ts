import type { XiangqiReviewPoint } from '@/games/xiangqi/ai/review'
import type {
  XiangqiReviewWorkerRequest,
  XiangqiReviewWorkerResponse,
} from '@/games/xiangqi/ai/review.worker'
import { cloneXiangqiMove } from '@/games/xiangqi/core/history'
import type { XiangqiBoard, XiangqiMove, XiangqiSide } from '@/games/xiangqi/types/xiangqi'
import { requestWorker } from '@/workerData'

export function analyzeXiangqiReviewInWorker(
  initialBoard: XiangqiBoard,
  moves: XiangqiMove[],
  humanSide: XiangqiSide,
  signal?: AbortSignal,
): Promise<XiangqiReviewPoint[]> {
  const request: Omit<XiangqiReviewWorkerRequest, 'id'> = {
    initialBoard: initialBoard.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
    moves: moves.map(cloneXiangqiMove),
    humanSide,
  }
  return requestWorker<XiangqiReviewWorkerRequest, XiangqiReviewWorkerResponse>(
    new URL('./review.worker.ts', import.meta.url),
    request,
    '象棋复盘',
    signal,
  ).then((response) => {
    if (!response.ok) throw new Error(response.error)
    return response.points
  })
}
