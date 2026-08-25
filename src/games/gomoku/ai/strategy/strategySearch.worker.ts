/// <reference lib="webworker" />
import { searchForcedWin, searchForcedWinFromMove, type ThreatSearchOptions, type ThreatSearchResult } from '@/games/gomoku/ai/threatSearch'
import type { Board, Player } from '@/games/gomoku/types/gomoku'
export interface StrategySearchRequest { id: number; board: Board; player: Player; move?: { row: number; col: number }; options: ThreatSearchOptions }
export type StrategySearchResponse = { id: number; ok: true; result: ThreatSearchResult } | { id: number; ok: false; error: string }
self.addEventListener('message', (event: MessageEvent<StrategySearchRequest>) => {
  try { self.postMessage({ id: event.data.id, ok: true, result: event.data.move ? searchForcedWinFromMove(event.data.board, event.data.player, event.data.move, event.data.options) : searchForcedWin(event.data.board, event.data.player, event.data.options) } satisfies StrategySearchResponse) }
  catch (error) { self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : '威胁搜索失败' } satisfies StrategySearchResponse) }
})
