import { searchXiangqi, type XiangqiSearchOptions, type XiangqiSearchResult } from '@/games/xiangqi/ai/search'
import type { XiangqiBoard, XiangqiSide } from '@/games/xiangqi/types/xiangqi'

export interface XiangqiSearchWorkerRequest { id: number; board: XiangqiBoard; side: XiangqiSide; options: Omit<XiangqiSearchOptions, 'shouldAbort'> }
export type XiangqiSearchWorkerResponse = { id: number; ok: true; result: XiangqiSearchResult } | { id: number; ok: false; error: string }

self.addEventListener('message', (event: MessageEvent<XiangqiSearchWorkerRequest>) => {
  try {
    self.postMessage({ id: event.data.id, ok: true, result: searchXiangqi(event.data.board, event.data.side, event.data.options) } satisfies XiangqiSearchWorkerResponse)
  } catch (error) {
    self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : '象棋搜索失败' } satisfies XiangqiSearchWorkerResponse)
  }
})
