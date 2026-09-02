import { onBeforeUnmount, ref } from 'vue'
import { analyzeReview } from '@/games/gomoku/ai/reviewClient'
import { requestGameReview } from '@/games/gomoku/ai/reviewDeepseek'
import { searchAIMoves } from '@/games/gomoku/ai/searchClient'
import { decideGomokuTurn } from '@/games/gomoku/ai/turnDecision'
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
  runSessionAgentPostmortem,
  saveReviewSummary,
  startSessionGame,
} from '@/games/gomoku/ai/sessionExperience'
import { createCheckpoint, type GameCheckpoint } from '@/games/gomoku/core/checkpoint'
import { createBoard, placePiece, resultAfterMove } from '@/games/gomoku/core/game'
import { advanceTurn, grantBonus } from '@/games/gomoku/core/turnScheduler'
import type {
  AIMove,
  BonusMoves,
  DecisionSource,
  GamePhase,
  GameResult,
  GameReview,
  GomokuAIDiagnostic,
  HintState,
  Move,
  Player,
  ReviewPhase,
  ReviewPoint,
  SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

export function useGomokuGameSession(onBack: () => void) {
  const board = ref(createBoard())
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
    onBack()
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
      if (experienceGameId) {
        finishSessionGame(experienceGameId, result.value, moves.value)
        void runSessionAgentPostmortem(experienceGameId)
      }
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
    source: DecisionSource,
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

  async function runAITurn() {
    const requestSessionId = gameSessionId.value
    aiController?.abort()
    const controller = new AbortController()
    aiController = controller
    clearHint()
    phase.value = 'aiThinking'
    errorMessage.value = ''

    const isCurrent = (positionKey: string) =>
      requestSessionId === gameSessionId.value &&
      !controller.signal.aborted &&
      currentPlayer.value === aiPlayer.value &&
      phase.value === 'aiThinking' &&
      createPositionKey(board.value, aiPlayer.value) === positionKey

    while (currentPlayer.value === aiPlayer.value && !result.value) {
      aiReason.value = ''
      const decision = await decideGomokuTurn({
        board: board.value,
        moves: moves.value,
        aiPlayer: aiPlayer.value,
        humanPlayer: humanPlayer.value,
        currentPlayer: currentPlayer.value,
        phase: phase.value,
        result: result.value,
        signal: controller.signal,
        isCurrent,
      })
      if (decision.kind === 'stale') return
      if (decision.searchFailure && experienceGameId) {
        recordGameAnomaly(experienceGameId, {
          subsystem: 'search',
          stage: 'worker',
          code: 'search_failed',
          message: decision.searchFailure,
          moveNumber: moves.value.length + 1,
          recoverable: true,
          fallbackAction: 'safe-search',
        })
      }
      if (decision.kind === 'error') {
        errorMessage.value = decision.message
        phase.value = 'aiError'
        if (experienceGameId)
          recordGameAnomaly(experienceGameId, {
            subsystem: 'search',
            stage: 'candidate_selection',
            code: 'no_legal_candidate',
            message: decision.message,
            moveNumber: moves.value.length + 1,
            recoverable: false,
          })
        return
      }
      appendDiagnostic(decision.diagnostic)
      if (
        applyAIMove(
          decision.move,
          decision.reason,
          decision.selected,
          decision.localBest,
          decision.source,
          decision.positionKey,
        )
      )
        return
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

  return {
    board,
    started,
    showSetup,
    humanPlayer,
    aiPlayer,
    bonusMoves,
    phase,
    result,
    aiReason,
    errorMessage,
    experienceMessage,
    hint,
    reviewPhase,
    reviewPoints,
    gameReview,
    reviewError,
    checkpoints,
    gameSessionId,
    isDevelopment,
    returnHome,
    handlePlayerMove,
    retryAI,
    showHint,
    undo,
    giveBonus,
    restart,
    clearExperience,
    copyAITrace,
    startGame,
    requestReviewSummary,
  }
}
