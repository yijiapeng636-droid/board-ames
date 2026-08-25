import { searchFixedCandidate, searchPosition } from '@/games/gomoku/ai/search'
import type { SearchWorkerRequest, SearchWorkerResponse } from '@/games/gomoku/ai/search.worker'

export function handleSearchWorkerRequest(request: SearchWorkerRequest): SearchWorkerResponse {
  try {
    if (request.kind === 'fixed') {
      return { id: request.id, ok: true, kind: 'fixed', result: searchFixedCandidate(request.board, request.move, request.rootPlayer, request.options) }
    }
    return { id: request.id, ok: true, kind: 'root', result: searchPosition(request.board, request.options) }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : '搜索 Worker 发生未知错误',
    }
  }
}
