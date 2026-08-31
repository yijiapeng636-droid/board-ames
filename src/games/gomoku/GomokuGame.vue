<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { analyzeReview } from '@/games/gomoku/ai/reviewClient'
import { requestGameReview } from '@/games/gomoku/ai/reviewDeepseek'
import { createSafeSearchFallback } from '@/games/gomoku/ai/search'
import { searchAIMoves } from '@/games/gomoku/ai/searchClient'
import { buildGomokuAgentContext } from '@/games/gomoku/ai/strategy/agentConfig'
import { describeGomokuAgentFailure } from '@/games/gomoku/ai/strategy/agentDiagnostics'
import {
  createGomokuFallback,
  runGomokuStrategyAgent,
} from '@/games/gomoku/ai/strategy/gomokuAgent'
import { validateGomokuTacticalGate } from '@/games/gomoku/ai/strategy/tacticalGate'
import {
  buildStrategyCandidateSet,
  strategyCandidateAsSearched,
} from '@/games/gomoku/ai/strategy/strategyCandidateSet'
import {
  clearSessionExperience,
  createPositionKey,
  decisionFromCandidate,
  finishSessionGame,
  getHistoricalAnomalies,
  getPositionExperience,
  getSessionReviewHistorySummary,
  interruptSessionGame,
  recordAIDiagnostic,
  recordAIDecision,
  recordGameAnomaly,
  recordGameMove,
  revertSessionMovesAfter,
  saveReviewSummary,
  startSessionGame,
  type AIDecisionSource,
} from '@/games/gomoku/ai/sessionExperience'
import { validateAIMove } from '@/games/gomoku/ai/validator'
import GameReviewPanel from '@/games/gomoku/components/GameReviewPanel.vue'
import GameStatus from '@/games/gomoku/components/GameStatus.vue'
import GomokuBoard from '@/games/gomoku/components/GomokuBoard.vue'
import { createCheckpoint, type GameCheckpoint } from '@/games/gomoku/core/checkpoint'
import { createBoard, placePiece, resultAfterMove } from '@/games/gomoku/core/game'
import { advanceTurn, grantBonus } from '@/games/gomoku/core/turnScheduler'
import type {
  AIMove,
  BonusMoves,
  GamePhase,
  GameResult,
  GameReview,
  GomokuAIDiagnostic,
  HintState,
  Move,
  Player,
  ReviewPhase,
  ReviewPoint,
  SearchResult,
  SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

const emit = defineEmits<{ back: [] }>()

const board = ref(createBoard())
const backgroundTheme = ref<'light' | 'vscode'>('light')
const boardDisplaySize = ref<'small' | 'medium' | 'large'>('medium')
const boardPalette = ref<'wood' | 'slate' | 'vscode'>('wood')
const moves = ref<Move[]>([])
const started = ref(false)
const showSetup = ref(false)
const humanPlayer = ref<Player>(1)
const aiPlayer = ref<Player>(2)
const currentPlayer = ref<Player>(1)
const bonusMoves = ref<BonusMoves>({ human: 0, ai: 0 })
const phase = ref<GamePhase>('playerTurn')
const result = ref<GameResult>(null)
const aiReason = ref('')
const errorMessage = ref('')
const experienceMessage = ref('')
const hint = ref<HintState>({ phase: 'idle', move: null, reason: '' })
const reviewPhase = ref<ReviewPhase>('idle')
const reviewPoints = ref<ReviewPoint[]>([])
const gameReview = ref<GameReview | null>(null)
const aiDiagnostics = ref<GomokuAIDiagnostic[]>([])
const reviewError = ref('')
const checkpoints = ref<GameCheckpoint[]>([])
const gameSessionId = ref(0)
let aiController: AbortController | null = null
let hintController: AbortController | null = null
let reviewController: AbortController | null = null
let experienceGameId: string | null = null
const isDevelopment = import.meta.env.DEV

function appendDiagnostic(diagnostic: GomokuAIDiagnostic) {
  aiDiagnostics.value = [...aiDiagnostics.value.slice(-59), structuredClone(diagnostic)]
  if (!experienceGameId) return
  recordAIDiagnostic(experienceGameId, diagnostic)
  if (diagnostic.fallbackReason) {
    recordGameAnomaly(experienceGameId, {
      subsystem: 'agent',
      stage: diagnostic.fallbackStage ?? 'decision',
      code: diagnostic.fallbackReason,
      message: diagnostic.fallbackMessage ?? diagnostic.fallbackReason,
      moveNumber: diagnostic.moveNumber,
      recoverable: true,
      fallbackAction: 'local-search',
    })
  }
}

async function copyAITrace() {
  if (!isDevelopment) return
  try {
    await navigator.clipboard.writeText(
      JSON.stringify({ moves: moves.value, diagnostics: aiDiagnostics.value }, null, 2),
    )
    experienceMessage.value = '本局 AI Trace 已复制'
  } catch {
    experienceMessage.value = '浏览器未允许复制 AI Trace'
  }
}

function clearHint() {
  hintController?.abort()
  hintController = null
  hint.value = { phase: 'idle', move: null, reason: '' }
}

function clearReview() {
  reviewController?.abort()
  reviewController = null
  reviewPhase.value = 'idle'
  reviewPoints.value = []
  gameReview.value = null
  reviewError.value = ''
}

function abortAll() {
  aiController?.abort()
  aiController = null
  clearHint()
  clearReview()
}

function returnHome() {
  gameSessionId.value += 1
  abortAll()
  if (experienceGameId) interruptSessionGame(experienceGameId, 'return-home')
  emit('back')
}

onBeforeUnmount(() => {
  gameSessionId.value += 1
  abortAll()
  if (experienceGameId) interruptSessionGame(experienceGameId, 'unmount')
})

function savePlayerCheckpoint() {
  checkpoints.value.push(
    createCheckpoint({
      board: board.value,
      moves: moves.value,
      currentPlayer: currentPlayer.value,
      bonusMoves: bonusMoves.value,
      phase: phase.value,
      result: result.value,
      aiReason: aiReason.value,
      error: errorMessage.value,
    }),
  )
}

async function requestReviewSummary(sessionId: number) {
  if (!result.value || reviewPoints.value.length === 0) return
  reviewController?.abort()
  const controller = new AbortController()
  reviewController = controller
  reviewPhase.value = 'requestingAI'
  reviewError.value = ''
  try {
    const review = await requestGameReview(
      result.value,
      moves.value,
      reviewPoints.value,
      getSessionReviewHistorySummary(),
      controller.signal,
    )
    if (sessionId !== gameSessionId.value) return
    gameReview.value = review
    reviewPhase.value = 'ready'
    if (experienceGameId) {
      saveReviewSummary(experienceGameId, {
        result: result.value,
        mistakeTags: review.recurringIssues,
        strengthTags: review.strengths,
        lessons: review.practiceSuggestions,
      })
    }
  } catch (error) {
    if (sessionId !== gameSessionId.value || controller.signal.aborted) return
    reviewPhase.value = 'error'
    reviewError.value = error instanceof Error ? error.message : 'AI 教学总结失败'
    if (experienceGameId)
      recordGameAnomaly(experienceGameId, {
        subsystem: 'review',
        stage: 'model_request',
        code: 'teaching_review_failed',
        message: reviewError.value,
        recoverable: true,
      })
  }
}

async function runReview() {
  const sessionId = gameSessionId.value
  clearReview()
  const controller = new AbortController()
  reviewController = controller
  reviewPhase.value = 'analyzing'
  try {
    const points = await analyzeReview(moves.value, humanPlayer.value, controller.signal)
    if (sessionId !== gameSessionId.value) return
    reviewPoints.value = points
    if (points.length === 0) {
      gameReview.value = {
        summary: '本地同量纲搜索未发现达到阈值的明显失误。',
        keyMoments: [],
        strengths: ['没有发现需要强行标记的错误回合'],
        recurringIssues: [],
        practiceSuggestions: ['继续优先检查立即胜、必须防守和强制路线'],
      }
      reviewPhase.value = 'ready'
      return
    }
    await requestReviewSummary(sessionId)
  } catch (error) {
    if (sessionId !== gameSessionId.value || controller.signal.aborted) return
    reviewPhase.value = 'error'
    reviewError.value = error instanceof Error ? error.message : '本地复盘失败'
    if (experienceGameId)
      recordGameAnomaly(experienceGameId, {
        subsystem: 'review',
        stage: 'local_analysis',
        code: 'local_review_failed',
        message: reviewError.value,
        recoverable: true,
      })
  }
}

function finishMove(row: number, col: number, mover: Player): boolean {
  result.value = resultAfterMove(board.value, row, col)
  if (result.value) {
    phase.value = 'gameOver'
    if (experienceGameId) finishSessionGame(experienceGameId, result.value, moves.value)
    clearHint()
    void runReview()
    return true
  }
  const next = advanceTurn(mover, bonusMoves.value, humanPlayer.value)
  bonusMoves.value = next.bonusMoves
  currentPlayer.value = next.currentPlayer
  phase.value = next.currentPlayer === humanPlayer.value ? 'playerTurn' : 'aiThinking'
  return false
}

function applyAIMove(
  move: AIMove,
  reason: string,
  selected: SearchedCandidate,
  localBest: SearchedCandidate,
  source: AIDecisionSource,
  positionKey: string,
) {
  placePiece(board.value, moves.value, move.row, move.col, aiPlayer.value, phase.value)
  if (experienceGameId) {
    recordGameMove(experienceGameId, {
      ...moves.value[moves.value.length - 1]!,
      phase: 'aiThinking',
    })
    recordAIDecision(
      experienceGameId,
      decisionFromCandidate(positionKey, selected, localBest, source),
      moves.value,
    )
  }
  aiReason.value = reason
  return finishMove(move.row, move.col, aiPlayer.value)
}

function useSearchFallback(
  searchResult: SearchResult,
  positionKey: string,
  reason: string,
): boolean {
  const fallback = searchResult.candidates[0]
  if (!fallback) {
    errorMessage.value = '没有可用的 AI 候选落点'
    phase.value = 'aiError'
    return true
  }
  return applyAIMove(fallback, reason, fallback, fallback, 'searchFallback', positionKey)
}

async function runAITurn() {
  const requestSessionId = gameSessionId.value
  aiController?.abort()
  const controller = new AbortController()
  aiController = controller
  clearHint()
  phase.value = 'aiThinking'
  errorMessage.value = ''

  while (currentPlayer.value === aiPlayer.value && !result.value) {
    aiReason.value = ''
    let searchResult: SearchResult
    try {
      searchResult = await searchAIMoves(board.value, controller.signal, {
        rootPlayer: aiPlayer.value,
      })
    } catch (error) {
      if (requestSessionId !== gameSessionId.value || controller.signal.aborted) return
      if (experienceGameId)
        recordGameAnomaly(experienceGameId, {
          subsystem: 'search',
          stage: 'worker',
          code: 'search_failed',
          message: error instanceof Error ? error.message : '本地搜索失败',
          moveNumber: moves.value.length + 1,
          recoverable: true,
          fallbackAction: 'safe-search',
        })
      searchResult = createSafeSearchFallback(board.value, aiPlayer.value)
    }
    if (requestSessionId !== gameSessionId.value || controller.signal.aborted) return
    const localBest = searchResult.candidates[0]
    if (!localBest) {
      errorMessage.value = '本地搜索没有返回合法候选'
      phase.value = 'aiError'
      if (experienceGameId)
        recordGameAnomaly(experienceGameId, {
          subsystem: 'search',
          stage: 'candidate_selection',
          code: 'no_legal_candidate',
          message: errorMessage.value,
          moveNumber: moves.value.length + 1,
          recoverable: false,
        })
      return
    }
    const positionKey = createPositionKey(board.value, aiPlayer.value)
    if (searchResult.forcedMoveType) {
      const reasons = {
        forcedWin: '本地搜索发现直接获胜点。',
        forcedBlock: '本地搜索阻止了你的下一步胜利。',
        forcedTactical: '本地搜索发现明确的连续强制战术。',
      }
      appendDiagnostic({
        moveNumber: moves.value.length + 1,
        aiPlayer: aiPlayer.value,
        sideToMove: currentPlayer.value,
        strategyCandidateCount: buildStrategyCandidateSet(board.value, aiPlayer.value, searchResult)
          .length,
        ...(searchResult.candidates[0]
          ? {
              baselineBest: {
                row: searchResult.candidates[0].row,
                col: searchResult.candidates[0].col,
                searchScore: searchResult.candidates[0].searchScore,
              },
            }
          : {}),
        baselineCompletedDepth: searchResult.metrics.searchDepth,
        forcedMoveType: searchResult.forcedMoveType,
        threatSearchStatus:
          searchResult.forcedMoveType === 'forcedTactical' ||
          searchResult.forcedMoveType === 'forcedWin'
            ? 'proven_win'
            : 'not_proven',
        agentUsed: false,
        agentToolCalls: [],
        agentModelCalls: 0,
        agentTotalDurationMs: 0,
        agentDirectFinal: false,
        finalMove: { row: localBest.row, col: localBest.col },
        finalSource: searchResult.trace.finalSource,
      })
      if (
        applyAIMove(
          localBest,
          reasons[searchResult.forcedMoveType],
          localBest,
          localBest,
          searchResult.forcedMoveType,
          positionKey,
        )
      )
        return
      continue
    }

    // Session experience remains weak, read-only evidence and never overrides search facts.
    const sessionExperience = getPositionExperience(positionKey)
    const context = buildGomokuAgentContext(
      board.value,
      moves.value,
      aiPlayer.value,
      humanPlayer.value,
      currentPlayer.value,
      searchResult,
      sessionExperience,
      getHistoricalAnomalies(3),
    )
    const contextIsCurrent = () =>
      requestSessionId === gameSessionId.value &&
      !controller.signal.aborted &&
      currentPlayer.value === aiPlayer.value &&
      phase.value === 'aiThinking' &&
      createPositionKey(board.value, aiPlayer.value) === context.positionKey
    try {
      const agentResult = await runGomokuStrategyAgent(context, controller.signal, contextIsCurrent)
      if (!contextIsCurrent()) return
      const toolNames = agentResult.trace.toolCalls.map((call) => call.name)
      const gateReason =
        agentResult.source === 'agent'
          ? validateGomokuTacticalGate(agentResult.decision, context)
          : null
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
      searchResult.trace.agent = {
        used: true,
        toolCalls: toolNames,
        modelCalls: agentResult.trace.modelCalls.length,
        totalDurationMs: agentResult.trace.totalDurationMs,
        directFinal: agentResult.trace.directFinal,
        selected: { row: decision.row, col: decision.col },
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(failure ? { fallbackStage: failure.stage, fallbackMessage: failure.message } : {}),
      }
      searchResult.trace.finalSource = decisionSource === 'agent' ? 'agent' : 'fallback'
      const move = validateAIMove(
        decision,
        board.value,
        phase.value,
        result.value,
        context.allowedCandidates,
      )
      const baselineSelected = searchResult.candidates.find(
        (candidate) => candidate.row === move.row && candidate.col === move.col,
      )
      const strategySelected = context.allowedCandidates.find(
        (candidate) => candidate.row === move.row && candidate.col === move.col,
      )!
      const selected =
        baselineSelected ?? strategyCandidateAsSearched(strategySelected, aiPlayer.value)
      appendDiagnostic({
        moveNumber: moves.value.length + 1,
        aiPlayer: aiPlayer.value,
        sideToMove: currentPlayer.value,
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
        finalSource: decisionSource === 'agent' ? 'agent' : 'fallback',
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
      })
      if (
        applyAIMove(
          move,
          decisionSource === 'agent'
            ? decision.reason
            : (failure?.message ?? 'DeepSeek Agent 未完成有效决策，已采用本地搜索结果。'),
          selected,
          localBest,
          decisionSource === 'agent' ? 'deepseek' : 'searchFallback',
          positionKey,
        )
      )
        return
    } catch (error) {
      if (!contextIsCurrent()) return
      const failure = describeGomokuAgentFailure(
        'orchestration_failed',
        undefined,
        'orchestration',
        error instanceof Error ? error.message : undefined,
      )
      searchResult.trace.agent = {
        used: true,
        toolCalls: [],
        fallbackReason: 'orchestration_failed',
        fallbackStage: failure.stage,
        fallbackMessage: failure.message,
        ...(failure.detail === undefined ? {} : { failureDetail: failure.detail }),
      }
      searchResult.trace.finalSource = 'fallback'
      appendDiagnostic({
        moveNumber: moves.value.length + 1,
        aiPlayer: aiPlayer.value,
        sideToMove: currentPlayer.value,
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
        finalSource: 'fallback',
        fallbackReason: 'orchestration_failed',
        fallbackStage: failure.stage,
        fallbackMessage: failure.message,
        ...(failure.detail === undefined ? {} : { failureDetail: failure.detail }),
      })
      if (isDevelopment) console.warn('[GomokuAgent orchestration failure]', error)
      if (useSearchFallback(searchResult, positionKey, failure.message)) return
    }
  }
}

function handlePlayerMove(row: number, col: number) {
  if (phase.value !== 'playerTurn' || currentPlayer.value !== humanPlayer.value || result.value)
    return
  clearHint()
  savePlayerCheckpoint()
  try {
    placePiece(board.value, moves.value, row, col, humanPlayer.value, phase.value)
    if (experienceGameId)
      recordGameMove(experienceGameId, {
        ...moves.value[moves.value.length - 1]!,
        phase: 'playerTurn',
      })
  } catch {
    checkpoints.value.pop()
    return
  }
  if (!finishMove(row, col, humanPlayer.value) && currentPlayer.value === aiPlayer.value)
    void runAITurn()
}

async function showHint() {
  if (phase.value !== 'playerTurn' || currentPlayer.value !== humanPlayer.value || result.value)
    return
  clearHint()
  const sessionId = gameSessionId.value
  const controller = new AbortController()
  hintController = controller
  hint.value = { phase: 'analyzing', move: null, reason: '' }
  try {
    const search = await searchAIMoves(board.value, controller.signal, {
      rootPlayer: humanPlayer.value,
    })
    if (sessionId !== gameSessionId.value || controller.signal.aborted) return
    const best = search.candidates[0]
    hint.value = best
      ? {
          phase: 'ready',
          move: { row: best.row, col: best.col },
          reason: `建议落在第 ${best.row + 1} 行、第 ${best.col + 1} 列`,
        }
      : { phase: 'error', move: null, reason: '当前没有可用提示' }
  } catch (error) {
    if (sessionId !== gameSessionId.value || controller.signal.aborted) return
    hint.value = { phase: 'error', move: null, reason: '提示计算失败，请重试' }
    if (experienceGameId)
      recordGameAnomaly(experienceGameId, {
        subsystem: 'search',
        stage: 'hint',
        code: 'hint_failed',
        message: error instanceof Error ? error.message : hint.value.reason,
        recoverable: true,
      })
  }
}

function giveBonus(player: Player) {
  if (phase.value !== 'playerTurn' || currentPlayer.value !== humanPlayer.value || result.value)
    return
  clearHint()
  const next = grantBonus(bonusMoves.value, player, humanPlayer.value)
  bonusMoves.value = next.bonusMoves
  experienceMessage.value = next.granted
    ? player === humanPlayer.value
      ? 'AI 已让你多下一手'
      : '你已让 AI 多下一手'
    : '该让子机会已经在等待使用，不能叠加'
}

function undo() {
  const checkpoint = checkpoints.value.pop()
  if (!checkpoint) return
  gameSessionId.value += 1
  abortAll()
  if (experienceGameId) revertSessionMovesAfter(experienceGameId, checkpoint.moves.length)
  board.value = checkpoint.board.map((line) => [...line])
  moves.value = checkpoint.moves.map((move) => ({ ...move }))
  aiDiagnostics.value = aiDiagnostics.value.filter(
    (diagnostic) => diagnostic.moveNumber <= moves.value.length,
  )
  currentPlayer.value = checkpoint.currentPlayer
  bonusMoves.value = { ...checkpoint.bonusMoves }
  phase.value = checkpoint.phase
  result.value = checkpoint.result
  aiReason.value = checkpoint.aiReason
  errorMessage.value = checkpoint.error
}

function retryAI() {
  if (phase.value === 'aiError' && !result.value) void runAITurn()
}

function startGame(selectedAIPlayer: Player, interruptionReason = 'side-change') {
  gameSessionId.value += 1
  abortAll()
  if (experienceGameId) interruptSessionGame(experienceGameId, interruptionReason)
  humanPlayer.value = selectedAIPlayer === 1 ? 2 : 1
  aiPlayer.value = selectedAIPlayer
  board.value = createBoard()
  moves.value = []
  currentPlayer.value = 1
  bonusMoves.value = { human: 0, ai: 0 }
  checkpoints.value = []
  aiDiagnostics.value = []
  phase.value = selectedAIPlayer === 1 ? 'aiThinking' : 'playerTurn'
  result.value = null
  aiReason.value = ''
  errorMessage.value = ''
  experienceMessage.value = ''
  started.value = true
  showSetup.value = false
  experienceGameId = startSessionGame([], selectedAIPlayer)
  if (selectedAIPlayer === 1) void runAITurn()
}

function restart() {
  startGame(aiPlayer.value, 'restart')
}

function clearExperience() {
  clearSessionExperience()
  experienceMessage.value = '本次浏览器会话经验已清空'
}

function applyVisualPreset(preset: 'classic' | 'slate' | 'vscode') {
  if (preset === 'classic') {
    backgroundTheme.value = 'light'
    boardPalette.value = 'wood'
  } else if (preset === 'slate') {
    backgroundTheme.value = 'vscode'
    boardPalette.value = 'slate'
  } else {
    backgroundTheme.value = 'vscode'
    boardPalette.value = 'vscode'
  }
}
</script>

<template>
  <div
    class="app-page"
    :data-theme="backgroundTheme"
    :data-stealth="backgroundTheme === 'vscode' && boardPalette === 'vscode'"
  >
    <main>
      <button type="button" class="back-home" @click="returnHome">返回首页</button>
      <h1>
        {{ backgroundTheme === 'vscode' && boardPalette === 'vscode' ? 'board.ts' : 'AI 五子棋' }}
      </h1>
      <p class="players">
        你：{{ humanPlayer === 1 ? '黑棋' : '白棋' }}　AI：{{ aiPlayer === 1 ? '黑棋' : '白棋' }}
      </p>
      <GameStatus
        :phase="phase"
        :result="result"
        :reason="aiReason"
        :error="errorMessage"
        :human-player="humanPlayer"
        :started="started"
      />
      <div class="board-scroll">
        <div class="board-shell">
          <GomokuBoard
            :board="board"
            :disabled="!started || phase !== 'playerTurn'"
            :hint-move="hint.move"
            :display-size="boardDisplaySize"
            :palette="boardPalette"
            @place="handlePlayerMove"
          />
          <button v-if="!started" type="button" class="start-on-board" @click="showSetup = true">
            开始对局
          </button>
        </div>
      </div>
      <div class="actions">
        <button v-if="phase === 'aiError'" type="button" @click="retryAI">重新请求 AI</button>
        <button
          type="button"
          :disabled="phase !== 'playerTurn' || hint.phase === 'analyzing'"
          @click="showHint"
        >
          {{ hint.phase === 'analyzing' ? '正在计算提示…' : '最佳提示' }}
        </button>
        <button type="button" :disabled="checkpoints.length === 0" @click="undo">悔棋</button>
        <details>
          <summary>让一步</summary>
          <div class="bonus-actions">
            <button
              type="button"
              :disabled="!started || phase !== 'playerTurn' || bonusMoves.human > 0"
              @click="giveBonus(humanPlayer)"
            >
              AI 让我一步
            </button>
            <button
              type="button"
              :disabled="!started || phase !== 'playerTurn' || bonusMoves.ai > 0"
              @click="giveBonus(aiPlayer)"
            >
              让 AI 一步
            </button>
          </div>
        </details>
        <details>
          <summary>背景组合</summary>
          <div class="setting-menu">
            <button
              type="button"
              :aria-pressed="backgroundTheme === 'light' && boardPalette === 'wood'"
              @click="applyVisualPreset('classic')"
            >
              经典米白 + 木棋盘
            </button>
            <button
              type="button"
              :aria-pressed="backgroundTheme === 'vscode' && boardPalette === 'slate'"
              @click="applyVisualPreset('slate')"
            >
              深色 + 石板棋盘
            </button>
            <button
              type="button"
              :aria-pressed="backgroundTheme === 'vscode' && boardPalette === 'vscode'"
              @click="applyVisualPreset('vscode')"
            >
              VS Code 隐身组合
            </button>
          </div>
        </details>
        <details>
          <summary>棋盘颜色</summary>
          <div class="setting-menu">
            <button
              type="button"
              :aria-pressed="boardPalette === 'wood'"
              @click="boardPalette = 'wood'"
            >
              经典木色
            </button>
            <button
              type="button"
              :aria-pressed="boardPalette === 'slate'"
              @click="boardPalette = 'slate'"
            >
              深色石板
            </button>
            <button
              type="button"
              :aria-pressed="boardPalette === 'vscode'"
              @click="boardPalette = 'vscode'"
            >
              VS Code 编辑器色
            </button>
          </div>
        </details>
        <details>
          <summary>棋盘大小</summary>
          <div class="setting-menu size-menu">
            <button
              v-for="option in [
                { value: 'small', label: '小' },
                { value: 'medium', label: '中' },
                { value: 'large', label: '大' },
              ] as const"
              :key="option.value"
              type="button"
              :aria-pressed="boardDisplaySize === option.value"
              @click="boardDisplaySize = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </details>
        <button type="button" @click="restart">重新开始</button>
        <button type="button" @click="showSetup = true">选择先后手</button>
        <button type="button" @click="clearExperience">清空本次会话经验</button>
        <button v-if="isDevelopment" type="button" @click="copyAITrace">复制本局 AI Trace</button>
      </div>
      <p v-if="hint.reason" class="hint-message" aria-live="polite">{{ hint.reason }}</p>
      <p v-if="experienceMessage" class="experience-message" aria-live="polite">
        {{ experienceMessage }}
      </p>
      <GameReviewPanel
        :phase="reviewPhase"
        :points="reviewPoints"
        :review="gameReview"
        :error="reviewError"
        @retry="requestReviewSummary(gameSessionId)"
      />
      <div
        v-if="showSetup"
        class="modal-backdrop"
        role="presentation"
        @click.self="showSetup = false"
      >
        <section class="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
          <h2 id="setup-title">选择 AI 的先后手</h2>
          <p>黑棋先手。你可以让 AI 执黑先下，或让 AI 执白后下。</p>
          <div class="setup-actions">
            <button type="button" @click="startGame(1)">AI 用黑棋先手</button>
            <button type="button" @click="startGame(2)">AI 用白棋后手</button>
            <button type="button" @click="showSetup = false">取消</button>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  color: #241b11;
  background: #f5f1e8;
  font-family: system-ui, sans-serif;
}
button {
  font: inherit;
}
</style>

<style scoped>
.app-page {
  --page-bg: #f5f1e8;
  --page-text: #241b11;
  --control-bg: #fffaf0;
  --control-border: #76501f;
  --panel-bg: #fffaf0;
  --panel-border: #c8ae86;
  min-height: 100vh;
  color: var(--page-text);
  background: var(--page-bg);
  transition:
    color 160ms ease,
    background 160ms ease;
}
.app-page[data-theme='vscode'] {
  --page-bg: #1e1e1e;
  --page-text: #d4d4d4;
  --control-bg: #2d2d30;
  --control-border: #6a6a6a;
  --panel-bg: #252526;
  --panel-border: #454545;
}
.app-page[data-stealth='true'] {
  background: linear-gradient(90deg, #181818 0 46px, transparent 46px), var(--page-bg);
}
.app-page[data-stealth='true'] main {
  font-family: Consolas, 'Courier New', monospace;
}
.app-page[data-stealth='true'] h1 {
  width: fit-content;
  padding: 0.45rem 1.5rem;
  border-top: 1px solid #007acc;
  color: #cccccc;
  background: #1e1e1e;
  font-size: 0.9rem;
  font-weight: 400;
}
.app-page[data-stealth='true'] .players,
.app-page[data-stealth='true'] :deep(.status) {
  color: #858585;
  font-size: 0.78rem;
}
.app-page[data-stealth='true'] .actions {
  font-size: 0.75rem;
}
main {
  width: min(100% - 2rem, 760px);
  margin: 0 auto;
  padding: 2rem 0;
}
.back-home {
  margin-bottom: 0.75rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--page-text);
  background: var(--control-bg);
  cursor: pointer;
}
h1 {
  margin: 0;
}
.players {
  margin: 0.5rem 0 0;
}
.board-scroll {
  overflow-x: auto;
  padding-bottom: 0.5rem;
}
.board-shell {
  position: relative;
  width: fit-content;
}
.start-on-board {
  position: absolute;
  z-index: 4;
  top: 50%;
  left: 50%;
  padding: 0.8rem 1.25rem;
  border: 2px solid #5f3d16;
  border-radius: 999px;
  color: #fff;
  background: #7b4e1c;
  box-shadow: 0 5px 18px rgb(0 0 0 / 28%);
  transform: translate(-50%, -50%);
  cursor: pointer;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1rem;
}
.actions button,
summary {
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--page-text);
  background: var(--control-bg);
  cursor: pointer;
}
.actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
summary {
  list-style: none;
}
.bonus-actions {
  position: absolute;
  z-index: 5;
  display: grid;
  gap: 0.4rem;
  margin-top: 0.35rem;
  padding: 0.5rem;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 4px 14px rgb(40 28 14 / 18%);
}
.setting-menu {
  position: absolute;
  z-index: 6;
  display: grid;
  gap: 0.4rem;
  margin-top: 0.35rem;
  padding: 0.5rem;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 4px 14px rgb(0 0 0 / 22%);
}
.size-menu {
  grid-template-columns: repeat(3, minmax(2.5rem, 1fr));
}
.setting-menu button[aria-pressed='true'] {
  border-color: #3794ff;
  outline: 2px solid #3794ff;
  outline-offset: -2px;
}
.hint-message {
  color: #8b1d16;
  font-weight: 600;
}
.experience-message {
  color: #52606d;
}
.modal-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(20 15 10 / 55%);
}
.setup-modal {
  width: min(100%, 430px);
  padding: 1.25rem;
  border-radius: 12px;
  color: var(--page-text);
  background: var(--panel-bg);
  box-shadow: 0 16px 45px rgb(0 0 0 / 32%);
}
.setup-modal h2 {
  margin-top: 0;
}
.setup-actions {
  display: grid;
  gap: 0.65rem;
}
.setup-actions button {
  padding: 0.7rem;
}
</style>
