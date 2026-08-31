import { searchAIMoves, searchFixedCandidateInWorker } from '@/games/gomoku/ai/searchClient'
import {
  createPositionKey,
  type HistoricalAnomalySummary,
} from '@/games/gomoku/ai/sessionExperience'
import {
  searchForcedWinFromMoveInWorker,
  searchForcedWinInWorker,
} from '@/games/gomoku/ai/strategy/strategySearchClient'
import { buildStrategyCandidateSet } from '@/games/gomoku/ai/strategy/strategyCandidateSet'
import { gomokuStrategyTools } from '@/games/gomoku/ai/strategy/strategyTools'
import type { GomokuAgentContext } from '@/games/gomoku/ai/strategy/strategyTypes'
import { inspectGomokuPosition } from './positionInspection'
import type {
  Board,
  Move,
  Player,
  PositionExperienceSummary,
  SearchResult,
} from '@/games/gomoku/types/gomoku'

export function buildGomokuAgentContext(
  board: Board,
  moves: Move[],
  aiPlayer: Player,
  humanPlayer: Player,
  sideToMove: Player,
  baselineSearch: SearchResult,
  sessionExperience?: PositionExperienceSummary,
  historicalAnomalies?: HistoricalAnomalySummary,
): GomokuAgentContext {
  const snapshot = board.map((line) => [...line])
  return {
    board: snapshot,
    moves: moves.map((move) => ({ ...move })),
    aiPlayer,
    humanPlayer,
    sideToMove,
    positionKey: createPositionKey(snapshot, sideToMove),
    positionInspection: inspectGomokuPosition(snapshot, aiPlayer),
    allowedCandidates: buildStrategyCandidateSet(snapshot, aiPlayer, baselineSearch),
    baselineSearch: structuredClone(baselineSearch),
    ...(sessionExperience ? { sessionExperience: structuredClone(sessionExperience) } : {}),
    ...(historicalAnomalies?.examples.length
      ? { historicalAnomalies: structuredClone(historicalAnomalies) }
      : {}),
    runSearch: (position, options, signal) => searchAIMoves(position, signal, options),
    runFixedSearch: (position, move, player, options, signal) =>
      searchFixedCandidateInWorker(position, move, player, options, signal),
    runThreatSearch: searchForcedWinInWorker,
    runThreatSearchFromMove: searchForcedWinFromMoveInWorker,
  }
}

export const GOMOKU_AGENT_BUDGET = {
  maxModelCalls: 4,
  maxToolCalls: 4,
  totalTimeoutMs: 18_000,
} as const
export { gomokuStrategyTools }
