import type { AgentFailureStage } from '@/ai/runtime/agentTypes'

export const BOARD_SIZE = 15

export type Piece = 0 | 1 | 2
export type Player = 1 | 2
export type GamePhase = 'playerTurn' | 'aiThinking' | 'aiError' | 'gameOver'
export type GameResult = 'blackWin' | 'whiteWin' | 'draw' | null
export type ReviewPhase = 'idle' | 'analyzing' | 'requestingAI' | 'ready' | 'error'
export type HintPhase = 'idle' | 'analyzing' | 'ready' | 'error'

export interface BonusMoves {
  human: number
  ai: number
}

export interface HintState {
  phase: HintPhase
  move: AIMove | null
  reason: string
}

export interface Move {
  turn: number
  player: Player
  row: number
  col: number
}

export interface AIMove {
  row: number
  col: number
  reason?: string
}

export interface AICandidate {
  row: number
  col: number
  attackScore: number
  defenseScore: number
  positionalScore: number
  orderingScore: number
  attackPatterns: string[]
  defensePatterns: string[]
  immediateWin: boolean
  blocksImmediateWin: boolean
  createsDoubleThreat: boolean
  createsFourThree: boolean
  forcesReply: boolean
  pureDefense: boolean
  /** Compatibility alias for orderingScore; not a position evaluation. */
  score: number
  features: string[]
}

export interface PrincipalVariationMove {
  player: 'black' | 'white'
  row: number
  col: number
}

export interface SearchedCandidate {
  row: number
  col: number
  staticScore: number
  searchScore: number
  features: string[]
  principalVariation: PrincipalVariationMove[]
}

export type ForcedMoveType = 'forcedWin' | 'forcedBlock' | 'forcedTactical' | null

export interface SearchMetrics {
  candidateCount: number
  searchedNodes: number
  searchDepth: number
  searchDurationMs: number
  cutoffCount: number
  cacheHits: number
  ttStores: number
  extensionNodes: number
  timedOut: boolean
}

export type DecisionSource =
  | 'immediateWin'
  | 'forcedBlock'
  | 'forcedTactical'
  | 'forcedWinSearch'
  | 'search'
  | 'agent'
  | 'fallback'

export interface GomokuDecisionTrace {
  aiPlayer: Player
  sideToMove: Player
  generatedCandidateCount: number
  candidates: Array<{
    row: number
    col: number
    attackScore: number
    defenseScore: number
    positionalScore: number
    orderingScore: number
    features: string[]
    includedInSearch: boolean
  }>
  forcedMoveType: ForcedMoveType
  search: {
    completedDepth: number
    searchedNodes: number
    cutoffCount: number
    cacheHits: number
    durationMs: number
    timedOut: boolean
  }
  baselineBest?: { row: number; col: number; searchScore: number }
  principalVariation: PrincipalVariationMove[]
  agent?: {
    used: boolean
    toolCalls: string[]
    modelCalls?: number
    totalDurationMs?: number
    directFinal?: boolean
    selected?: { row: number; col: number }
    fallbackReason?: string
    fallbackStage?: AgentFailureStage
    fallbackMessage?: string
    failureDetail?: string
  }
  finalSource: DecisionSource
}

export interface GomokuAIDiagnostic {
  moveNumber: number
  aiPlayer: Player
  sideToMove: Player
  strategyCandidateCount: number
  baselineBest?: { row: number; col: number; searchScore: number }
  baselineCompletedDepth: number
  forcedMoveType: ForcedMoveType
  threatSearchStatus: ThreatProofStatus
  agentUsed: boolean
  agentToolCalls: string[]
  agentModelCalls: number
  agentTotalDurationMs: number
  agentDirectFinal: boolean
  agentSelected?: { row: number; col: number }
  finalMove: { row: number; col: number }
  finalSource: DecisionSource
  fallbackReason?: string
  fallbackStage?: AgentFailureStage
  fallbackMessage?: string
  failureModelCall?: number
  failureToolName?: string
  failureDetail?: string
}

export interface SearchResult {
  candidates: SearchedCandidate[]
  forcedMoveType: ForcedMoveType
  metrics: SearchMetrics
  trace: GomokuDecisionTrace
}

export type ThreatProofStatus = 'proven_win' | 'not_proven' | 'timeout'

export interface FixedCandidateSearchResult {
  move: { row: number; col: number }
  searchScore: number
  completedDepth: number
  timedOut: boolean
  principalVariation: PrincipalVariationMove[]
  forcedWin: boolean
  opponentBestReply?: { row: number; col: number }
  metrics: {
    searchedNodes: number
    cacheHits: number
    cutoffs: number
    durationMs: number
    ttStores: number
    extensionNodes: number
  }
}

export interface ReviewPoint {
  moveNumber: number
  player: 'black' | 'white'
  playedMove: { row: number; col: number }
  recommendedMove: { row: number; col: number }
  actualSearchScore: number
  recommendedSearchScore: number
  classification: 'mistake'
  evidence: string[]
  tacticalFacts: {
    actual: string[]
    recommended: string[]
  }
  features: string[]
  principalVariation: PrincipalVariationMove[]
}

export interface GameReview {
  summary: string
  keyMoments: Array<{
    moveNumber: number
    title: string
    explanation: string
    suggestion: string
  }>
  strengths: string[]
  recurringIssues: string[]
  practiceSuggestions: string[]
}

export interface ReviewSummary {
  result: Exclude<GameResult, null>
  mistakeTags: string[]
  strengthTags: string[]
  lessons: string[]
}

export interface SessionReviewHistorySummary {
  reviewedGames: number
  repeatedMistakeTags: Array<{ tag: string; count: number }>
  recentLessons: string[]
}

export interface PositionExperienceMove {
  row: number
  col: number
  played: number
  finalResults: { win: number; loss: number; draw: number }
}

export interface PositionExperienceSummary {
  seen: number
  moves: PositionExperienceMove[]
}

export interface GameSnapshot {
  boardSize: number
  humanPlayer: 'black' | 'white'
  aiPlayer: 'black' | 'white'
  board: string[]
  moves: Move[]
  searchedCandidates: SearchedCandidate[]
  sessionExperience?: PositionExperienceSummary
}

export type Board = Piece[][]
