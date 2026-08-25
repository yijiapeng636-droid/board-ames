/// <reference lib="webworker" />

import type { SearchOptions } from '@/games/gomoku/ai/search'
import { handleSearchWorkerRequest } from '@/games/gomoku/ai/searchWorkerProtocol'
import type { Board, FixedCandidateSearchResult, Player, SearchResult } from '@/games/gomoku/types/gomoku'

export type SearchWorkerRequest =
  | { id: number; kind?: 'root'; board: Board; options?: SearchOptions }
  | { id: number; kind: 'fixed'; board: Board; move: { row: number; col: number }; rootPlayer: Player; options?: SearchOptions }

export type SearchWorkerResponse =
  | { id: number; ok: true; kind: 'root'; result: SearchResult }
  | { id: number; ok: true; kind: 'fixed'; result: FixedCandidateSearchResult }
  | { id: number; ok: false; error: string }

self.addEventListener('message', (event: MessageEvent<SearchWorkerRequest>) => {
  self.postMessage(handleSearchWorkerRequest(event.data))
})
