import { createSafeSearchFallback } from '@/games/gomoku/ai/search'
import { searchAIMoves } from '@/games/gomoku/ai/searchClient'
import { buildGomokuAgentContext } from '@/games/gomoku/ai/strategy/agentConfig'
import { describeGomokuAgentFailure } from '@/games/gomoku/ai/strategy/agentDiagnostics'
import {
  createGomokuFallback,
  runGomokuStrategyAgent,
} from '@/games/gomoku/ai/strategy/gomokuAgent'
import {
  validateGomokuTacticalGate,
  verifyGomokuAgentDecisionSafety,
} from '@/games/gomoku/ai/strategy/tacticalGate'
import {
  buildStrategyCandidateSet,
  strategyCandidateAsSearched,
} from '@/games/gomoku/ai/strategy/strategyCandidateSet'
import {
  createPositionKey,
  getHistoricalAnomalies,
  getPositionExperience,
} from '@/games/gomoku/ai/sessionExperience'
import { validateAIMove } from '@/games/gomoku/ai/validator'
import type {
  AIMove,
  Board,
  DecisionSource,
  GamePhase,
  GameResult,
  GomokuAIDiagnostic,
  Move,
  Player,
  SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

export type GomokuTurnDecision =
  | {
      kind: 'move'
      move: AIMove
      reason: string
      selected: SearchedCandidate
      localBest: SearchedCandidate
      source: DecisionSource
      positionKey: string
      diagnostic: GomokuAIDiagnostic
      searchFailure?: string
    }
  | { kind: 'error'; message: string; searchFailure?: string }
  | { kind: 'stale' }

interface GomokuTurnInput {
  board: Board
  moves: Move[]
  aiPlayer: Player
  humanPlayer: Player
  currentPlayer: Player
  phase: GamePhase
  result: GameResult
  signal: AbortSignal
  isCurrent: (positionKey: string) => boolean
}

export async function decideGomokuTurn(input: GomokuTurnInput): Promise<GomokuTurnDecision> {
  let searchFailure: string | undefined
  let searchResult
  try {
    searchResult = await searchAIMoves(input.board, input.signal, {
      rootPlayer: input.aiPlayer,
    })
  } catch (error) {
    if (input.signal.aborted) return { kind: 'stale' }
    searchFailure = error instanceof Error ? error.message : '本地搜索失败'
    searchResult = createSafeSearchFallback(input.board, input.aiPlayer)
  }

  const localBest = searchResult.candidates[0]
  if (!localBest) return { kind: 'error', message: '本地搜索没有返回合法候选', searchFailure }
  const positionKey = createPositionKey(input.board, input.aiPlayer)
  if (!input.isCurrent(positionKey)) return { kind: 'stale' }

  if (searchResult.forcedMoveType) {
    const reasons = {
      forcedWin: '本地搜索发现直接获胜点。',
      forcedBlock: '本地搜索阻止了你的下一步胜利。',
      forcedTactical: '本地搜索发现明确的连续强制战术。',
    }
    return {
      kind: 'move',
      move: localBest,
      reason: reasons[searchResult.forcedMoveType],
      selected: localBest,
      localBest,
      source: searchResult.forcedMoveType,
      positionKey,
      searchFailure,
      diagnostic: {
        moveNumber: input.moves.length + 1,
        aiPlayer: input.aiPlayer,
        sideToMove: input.currentPlayer,
        strategyCandidateCount: buildStrategyCandidateSet(input.board, input.aiPlayer, searchResult)
          .length,
        baselineBest: {
          row: localBest.row,
          col: localBest.col,
          searchScore: localBest.searchScore,
        },
        baselineCompletedDepth: searchResult.metrics.searchDepth,
        forcedMoveType: searchResult.forcedMoveType,
        threatSearchStatus:
          searchResult.forcedMoveType === 'forcedBlock' ? 'not_proven' : 'proven_win',
        agentUsed: false,
        agentToolCalls: [],
        agentModelCalls: 0,
        agentTotalDurationMs: 0,
        agentDirectFinal: false,
        finalMove: { row: localBest.row, col: localBest.col },
        finalSource: searchResult.trace.finalSource,
      },
    }
  }

  const context = buildGomokuAgentContext(
    input.board,
    input.moves,
    input.aiPlayer,
    input.humanPlayer,
    input.currentPlayer,
    searchResult,
    getPositionExperience(positionKey),
    getHistoricalAnomalies(3),
  )
  const contextIsCurrent = () => input.isCurrent(context.positionKey)

  try {
    const agentResult = await runGomokuStrategyAgent(context, input.signal, contextIsCurrent)
    if (!contextIsCurrent()) return { kind: 'stale' }
    const toolNames = agentResult.trace.toolCalls.map((call) => call.name)
    let gateReason =
      agentResult.source === 'agent'
        ? validateGomokuTacticalGate(agentResult.decision, context)
        : null
    if (agentResult.source === 'agent' && !gateReason) {
      gateReason = await verifyGomokuAgentDecisionSafety(
        agentResult.decision,
        context,
        input.signal,
      )
      if (!contextIsCurrent()) return { kind: 'stale' }
    }
    const decision = gateReason ? createGomokuFallback(context, gateReason) : agentResult.decision
    const decisionSource = gateReason ? 'fallback' : agentResult.source
    const fallbackReason = gateReason ?? agentResult.trace.fallbackReason
    const failure = fallbackReason
      ? describeGomokuAgentFailure(
          fallbackReason,
          agentResult.trace,
          gateReason ? 'tactical_gate' : undefined,
        )
      : null
    const move = validateAIMove(
      decision,
      input.board,
      input.phase,
      input.result,
      context.allowedCandidates,
    )
    const baselineSelected = searchResult.candidates.find(
      (candidate) => candidate.row === move.row && candidate.col === move.col,
    )
    const strategySelected = context.allowedCandidates.find(
      (candidate) => candidate.row === move.row && candidate.col === move.col,
    )!
    const selected =
      baselineSelected ?? strategyCandidateAsSearched(strategySelected, input.aiPlayer)
    return {
      kind: 'move',
      move,
      reason:
        decisionSource === 'agent'
          ? decision.reason
          : (failure?.message ?? 'DeepSeek Agent 未完成有效决策，已采用本地搜索结果。'),
      selected,
      localBest,
      source: decisionSource === 'agent' ? 'deepseek' : 'searchFallback',
      positionKey,
      searchFailure,
      diagnostic: {
        moveNumber: input.moves.length + 1,
        aiPlayer: input.aiPlayer,
        sideToMove: input.currentPlayer,
        strategyCandidateCount: context.allowedCandidates.length,
        baselineBest: {
          row: localBest.row,
          col: localBest.col,
          searchScore: localBest.searchScore,
        },
        baselineCompletedDepth: searchResult.metrics.searchDepth,
        forcedMoveType: searchResult.forcedMoveType,
        threatSearchStatus: 'not_proven',
        agentUsed: true,
        agentToolCalls: toolNames,
        agentModelCalls: agentResult.trace.modelCalls.length,
        agentTotalDurationMs: agentResult.trace.totalDurationMs,
        agentDirectFinal: agentResult.trace.directFinal,
        agentSelected: { row: agentResult.decision.row, col: agentResult.decision.col },
        finalMove: { row: move.row, col: move.col },
        finalSource: decisionSource === 'agent' ? 'deepseek' : 'searchFallback',
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(failure
          ? {
              fallbackStage: failure.stage,
              fallbackMessage: failure.message,
              ...(failure.modelCall === undefined ? {} : { failureModelCall: failure.modelCall }),
              ...(failure.toolName === undefined ? {} : { failureToolName: failure.toolName }),
              ...(failure.detail === undefined ? {} : { failureDetail: failure.detail }),
            }
          : {}),
      },
    }
  } catch (error) {
    if (!contextIsCurrent()) return { kind: 'stale' }
    const failure = describeGomokuAgentFailure(
      'orchestration_failed',
      undefined,
      'orchestration',
      error instanceof Error ? error.message : undefined,
    )
    return {
      kind: 'move',
      move: localBest,
      reason: failure.message,
      selected: localBest,
      localBest,
      source: 'searchFallback',
      positionKey,
      searchFailure,
      diagnostic: {
        moveNumber: input.moves.length + 1,
        aiPlayer: input.aiPlayer,
        sideToMove: input.currentPlayer,
        strategyCandidateCount: context.allowedCandidates.length,
        baselineBest: {
          row: localBest.row,
          col: localBest.col,
          searchScore: localBest.searchScore,
        },
        baselineCompletedDepth: searchResult.metrics.searchDepth,
        forcedMoveType: searchResult.forcedMoveType,
        threatSearchStatus: 'not_proven',
        agentUsed: true,
        agentToolCalls: [],
        agentModelCalls: 0,
        agentTotalDurationMs: 0,
        agentDirectFinal: false,
        finalMove: { row: localBest.row, col: localBest.col },
        finalSource: 'searchFallback',
        fallbackReason: 'orchestration_failed',
        fallbackStage: failure.stage,
        fallbackMessage: failure.message,
        ...(failure.detail === undefined ? {} : { failureDetail: failure.detail }),
      },
    }
  }
}
