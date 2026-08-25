import type { AgentFallbackReason } from '@/ai/runtime/agentTypes'
import type { SearchOptions } from '@/games/gomoku/ai/search'
import type { ThreatSearchOptions, ThreatSearchResult } from '@/games/gomoku/ai/threatSearch'
import type { Board, FixedCandidateSearchResult, Move, Player, PositionExperienceSummary, PrincipalVariationMove, SearchResult } from '@/games/gomoku/types/gomoku'

export type StrategyMode = 'quick' | 'normal' | 'deep' | 'forcing'
export interface StrategyPosition { row: number; col: number }
export interface StrategyCandidate extends StrategyPosition {
  attackScore: number
  defenseScore: number
  positionalScore: number
  orderingScore: number
  features: string[]
  immediateWin: boolean
  blocksImmediateWin: boolean
  forcesReply: boolean
  createsDoubleThreat: boolean
  createsFourThree: boolean
  protected: boolean
  sources: Array<'immediate_win' | 'mandatory_block' | 'forcing' | 'baseline' | 'attacking' | 'candidate_pool'>
  baselineSearchScore?: number
  baselinePrincipalVariation?: PrincipalVariationMove[]
}
export interface PositionInspection {
  aiPlayer: 'black' | 'white'
  immediateWins: StrategyPosition[]
  opponentImmediateWins: StrategyPosition[]
  mandatoryDefense: { required: boolean; moves: StrategyPosition[] }
  forcingMoves: StrategyPosition[]
  opponentForcingMoves: StrategyPosition[]
}
export interface GomokuAgentContext {
  readonly board: Board
  readonly moves: Move[]
  readonly aiPlayer: Player
  readonly humanPlayer: Player
  readonly sideToMove: Player
  readonly positionKey: string
  readonly positionInspection: PositionInspection
  readonly allowedCandidates: StrategyCandidate[]
  readonly baselineSearch: SearchResult
  readonly sessionExperience?: PositionExperienceSummary
  readonly runSearch: (board: Board, options: SearchOptions, signal: AbortSignal) => Promise<SearchResult>
  readonly runFixedSearch: (board: Board, move: StrategyPosition, player: Player, options: SearchOptions, signal: AbortSignal) => Promise<FixedCandidateSearchResult>
  readonly runThreatSearch: (board: Board, player: Player, options: ThreatSearchOptions, signal: AbortSignal) => Promise<ThreatSearchResult>
  readonly runThreatSearchFromMove: (board: Board, player: Player, move: StrategyPosition, options: ThreatSearchOptions, signal: AbortSignal) => Promise<ThreatSearchResult>
}

export interface GomokuStrategyDecision {
  row: number
  col: number
  strategy: 'forced_attack' | 'mandatory_defense' | 'initiative' | 'positional'
  reason: string
  evidence: string[]
}

export interface GomokuStrategyTool {
  name: 'search_forced_win' | 'search_candidate' | 'compare_candidates'
  description: string
  inputSchema: Record<string, unknown>
  execute(input: unknown, context: GomokuAgentContext, signal: AbortSignal): Promise<unknown>
}
export type GomokuAgentFallbackReason = AgentFallbackReason
