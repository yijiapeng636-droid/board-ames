import type { XiangqiBoard, XiangqiMove, XiangqiMoveOption, XiangqiSide } from '@/games/xiangqi/types/xiangqi'
import type { XiangqiSearchCandidate } from '@/games/xiangqi/ai/search'

function sameMove(left: Pick<XiangqiMoveOption, 'from' | 'to'>, right: Pick<XiangqiMoveOption, 'from' | 'to'>) {
  return left.from.row === right.from.row && left.from.col === right.from.col && left.to.row === right.to.row && left.to.col === right.to.col
}

export async function requestXiangqiMove(board: XiangqiBoard, moves: XiangqiMove[], sideToMove: XiangqiSide, searchedCandidates: XiangqiSearchCandidate[], sessionExperience: unknown, signal?: AbortSignal): Promise<{ move: XiangqiSearchCandidate; reason: string }> {
  const response = await fetch('/api/xiangqi/move', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sideToMove, board, moves, searchedCandidates, sessionExperience }), signal,
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `DeepSeek请求失败（HTTP ${response.status}）`)
  if (!data || typeof data !== 'object') throw new Error('DeepSeek未返回有效象棋着法')
  const candidate = searchedCandidates.find((item) => sameMove(item, data as Pick<XiangqiMoveOption, 'from' | 'to'>))
  if (!candidate) throw new Error('DeepSeek返回了候选列表之外的着法')
  return { move: candidate, reason: typeof (data as { reason?: unknown }).reason === 'string' ? (data as { reason: string }).reason : 'DeepSeek从本地合法候选中选择' }
}

export async function requestXiangqiReview(payload: unknown, signal?: AbortSignal): Promise<{ summary: string; suggestions: string[] }> {
  const response = await fetch('/api/xiangqi/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok || !data || typeof data !== 'object' || typeof (data as { summary?: unknown }).summary !== 'string' || !Array.isArray((data as { suggestions?: unknown }).suggestions)) throw new Error('DeepSeek未返回有效象棋复盘')
  return data as { summary: string; suggestions: string[] }
}
