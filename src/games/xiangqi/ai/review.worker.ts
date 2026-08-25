import { analyzeXiangqiReview, type XiangqiReviewPoint } from '@/games/xiangqi/ai/review'
import type { XiangqiBoard, XiangqiMove, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

export interface XiangqiReviewWorkerRequest { id: number; initialBoard: XiangqiBoard; moves: XiangqiMove[]; humanSide: XiangqiSide }
export type XiangqiReviewWorkerResponse = { id: number; ok: true; points: XiangqiReviewPoint[] } | { id: number; ok: false; error: string }
self.addEventListener('message', (event: MessageEvent<XiangqiReviewWorkerRequest>) => {
  try { self.postMessage({ id: event.data.id, ok: true, points: analyzeXiangqiReview(event.data.initialBoard, event.data.moves, event.data.humanSide) } satisfies XiangqiReviewWorkerResponse) }
  catch (error) { self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : '象棋复盘失败' } satisfies XiangqiReviewWorkerResponse) }
})
