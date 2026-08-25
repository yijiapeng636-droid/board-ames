/// <reference lib="webworker" />

import { analyzeGameReviewPoints } from '@/games/gomoku/ai/review'
import type { Move, Player, ReviewPoint } from '@/games/gomoku/types/gomoku'

export interface ReviewWorkerRequest {
  id: number
  moves: Move[]
  humanPlayer: Player
}

export type ReviewWorkerResponse =
  { id: number; ok: true; points: ReviewPoint[] } | { id: number; ok: false; error: string }

self.addEventListener('message', (event: MessageEvent<ReviewWorkerRequest>) => {
  try {
    self.postMessage({
      id: event.data.id,
      ok: true,
      points: analyzeGameReviewPoints(event.data.moves, event.data.humanPlayer),
    } satisfies ReviewWorkerResponse)
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : '复盘分析失败',
    } satisfies ReviewWorkerResponse)
  }
})
