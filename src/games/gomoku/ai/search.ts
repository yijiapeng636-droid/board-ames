import { evaluateCandidate, generateCandidatePool } from '@/games/gomoku/ai/candidates'
import { evaluatePosition } from '@/games/gomoku/ai/evaluation'
import { SEARCH_CONFIG, SEARCH_WIN_SCORE } from '@/games/gomoku/ai/searchConfig'
import { findWinningMoves } from '@/games/gomoku/ai/threatAnalysis'
import { searchForcedWin } from '@/games/gomoku/ai/threatSearch'
import { inspectGomokuPosition } from '@/games/gomoku/ai/strategy/positionInspection'
import { applyTTBound, classifyTTBound, type TTEntry } from '@/games/gomoku/ai/transposition'
import { isBoardFull } from '@/games/gomoku/core/game'
import { getWinner } from '@/games/gomoku/core/winner'
import {
  BOARD_SIZE,
  type AICandidate,
  type Board,
  type FixedCandidateSearchResult,
  type ForcedMoveType,
  type GomokuDecisionTrace,
  type Player,
  type PrincipalVariationMove,
  type SearchMetrics,
  type SearchResult,
  type SearchedCandidate,
} from '@/games/gomoku/types/gomoku'

export interface SearchOptions {
  rootPlayer?: Player
  maxDepth?: number
  maxMs?: number
  branchLimit?: number
  candidatePoolLimit?: number
  finalCandidateLimit?: number
  useCache?: boolean
  extensionDepth?: number
  maxExtensionNodes?: number
  threatMaxPly?: number
}

interface NodeResult {
  score: number
  line: PrincipalVariationMove[]
  completed: boolean
}
interface SearchContext {
  rootPlayer: Player
  deadline: number
  branchLimit: number
  useCache: boolean
  table: Map<string, TTEntry>
  metrics: SearchMetrics
  extensionDepth: number
  maxExtensionNodes: number
}

function cloneBoard(board: Board): Board {
  return board.map((line) => [...line])
}
function other(player: Player): Player {
  return player === 1 ? 2 : 1
}
function playerName(player: Player): 'black' | 'white' {
  return player === 1 ? 'black' : 'white'
}
function boardKey(board: Board, player: Player) {
  let key = String.fromCharCode(player)
  for (const line of board) key += String.fromCharCode(...line)
  return key
}

export function getSearchTerminalScore(
  board: Board,
  row: number,
  col: number,
  ply: number,
  rootPlayer: Player = 2,
): number | null {
  const winner = getWinner(board, row, col)
  if (winner === rootPlayer) return SEARCH_WIN_SCORE - ply
  if (winner === 1 || winner === 2) return -SEARCH_WIN_SCORE + ply
  if (isBoardFull(board)) return 0
  return null
}

function orderedCandidates(
  board: Board,
  player: Player,
  limit: number,
  preferred?: { row: number; col: number },
) {
  return generateCandidatePool(board, player, limit).sort(
    (left, right) =>
      Number(right.immediateWin) - Number(left.immediateWin) ||
      Number(right.blocksImmediateWin) - Number(left.blocksImmediateWin) ||
      Number(right.forcesReply) - Number(left.forcesReply) ||
      Number(right.row === preferred?.row && right.col === preferred?.col) -
        Number(left.row === preferred?.row && left.col === preferred?.col) ||
      right.orderingScore - left.orderingScore,
  )
}

function minimax(
  board: Board,
  depth: number,
  currentPlayer: Player,
  alphaValue: number,
  betaValue: number,
  lastMove: { row: number; col: number },
  ply: number,
  extensionLeft: number,
  context: SearchContext,
): NodeResult {
  context.metrics.searchedNodes += 1
  const terminal = getSearchTerminalScore(
    board,
    lastMove.row,
    lastMove.col,
    ply,
    context.rootPlayer,
  )
  if (terminal !== null) return { score: terminal, line: [], completed: true }
  if (Date.now() >= context.deadline) {
    context.metrics.timedOut = true
    return {
      score: evaluatePosition(board, context.rootPlayer, currentPlayer),
      line: [],
      completed: false,
    }
  }

  const key = `${boardKey(board, currentPlayer)}|depth:${depth}|ext:${extensionLeft}`
  const cached = context.useCache ? context.table.get(key) : undefined
  const alphaOriginal = alphaValue
  const betaOriginal = betaValue
  let alpha = alphaValue
  let beta = betaValue
  if (cached && cached.depth >= depth) {
    context.metrics.cacheHits += 1
    if (cached.bound === 'exact')
      return { score: cached.score, line: [...cached.principalVariation], completed: true }
    const applied = applyTTBound(cached, alpha, beta)
    alpha = applied.alpha
    beta = applied.beta
    if (applied.usable)
      return { score: applied.score, line: [...cached.principalVariation], completed: true }
  }

  let effectiveDepth = depth
  let nextExtension = extensionLeft
  let leafCandidates: AICandidate[] | undefined
  if (depth === 0 && extensionLeft > 0) {
    leafCandidates = orderedCandidates(board, currentPlayer, context.branchLimit)
    const tactical = leafCandidates.some(
      (move) => move.immediateWin || move.blocksImmediateWin || move.forcesReply,
    )
    if (tactical) {
      if (context.metrics.extensionNodes >= context.maxExtensionNodes) {
        context.metrics.timedOut = true
        return {
          score: evaluatePosition(board, context.rootPlayer, currentPlayer),
          line: [],
          completed: false,
        }
      }
      effectiveDepth = 1
      nextExtension -= 1
      context.metrics.extensionNodes += 1
    }
  }
  if (effectiveDepth === 0)
    return {
      score: evaluatePosition(board, context.rootPlayer, currentPlayer, leafCandidates),
      line: [],
      completed: true,
    }

  const candidates =
    leafCandidates ?? orderedCandidates(board, currentPlayer, context.branchLimit, cached?.bestMove)
  if (candidates.length === 0) return { score: 0, line: [], completed: true }
  const maximizing = currentPlayer === context.rootPlayer
  let bestScore = maximizing ? -Infinity : Infinity
  let bestLine: PrincipalVariationMove[] = []
  for (const candidate of candidates) {
    board[candidate.row]![candidate.col] = currentPlayer
    const child = minimax(
      board,
      effectiveDepth - 1,
      other(currentPlayer),
      alpha,
      beta,
      candidate,
      ply + 1,
      nextExtension,
      context,
    )
    board[candidate.row]![candidate.col] = 0
    if (!child.completed) return { score: bestScore, line: bestLine, completed: false }
    const better = maximizing ? child.score > bestScore : child.score < bestScore
    if (better) {
      bestScore = child.score
      bestLine = [
        { player: playerName(currentPlayer), row: candidate.row, col: candidate.col },
        ...child.line,
      ]
    }
    if (maximizing) alpha = Math.max(alpha, bestScore)
    else beta = Math.min(beta, bestScore)
    if (beta <= alpha) {
      context.metrics.cutoffCount += 1
      break
    }
  }
  if (context.useCache) {
    context.table.set(key, {
      depth: effectiveDepth,
      score: bestScore,
      bound: classifyTTBound(bestScore, alphaOriginal, betaOriginal),
      ...(bestLine[0] ? { bestMove: { row: bestLine[0].row, col: bestLine[0].col } } : {}),
      principalVariation: [...bestLine],
    })
    context.metrics.ttStores += 1
  }
  return { score: bestScore, line: bestLine, completed: true }
}

function asSearched(
  candidate: AICandidate,
  rootPlayer: Player,
  searchScore = candidate.orderingScore,
  line?: PrincipalVariationMove[],
): SearchedCandidate {
  return {
    row: candidate.row,
    col: candidate.col,
    staticScore: candidate.orderingScore,
    searchScore,
    features: [...candidate.features],
    principalVariation: line ?? [
      { player: playerName(rootPlayer), row: candidate.row, col: candidate.col },
    ],
  }
}

function metricsFor(candidateCount: number): SearchMetrics {
  return {
    candidateCount,
    searchedNodes: 0,
    searchDepth: 0,
    searchDurationMs: 0,
    cutoffCount: 0,
    cacheHits: 0,
    ttStores: 0,
    extensionNodes: 0,
    timedOut: false,
  }
}

function traceFor(
  rootPlayer: Player,
  pool: AICandidate[],
  metrics: SearchMetrics,
  forcedMoveType: ForcedMoveType,
  candidates: SearchedCandidate[],
  finalSource: GomokuDecisionTrace['finalSource'],
): GomokuDecisionTrace {
  return {
    aiPlayer: rootPlayer,
    sideToMove: rootPlayer,
    generatedCandidateCount: pool.length,
    candidates: pool.map((item) => ({
      row: item.row,
      col: item.col,
      attackScore: item.attackScore,
      defenseScore: item.defenseScore,
      positionalScore: item.positionalScore,
      orderingScore: item.orderingScore,
      features: [...item.features],
      includedInSearch: candidates.some(
        (candidate) => candidate.row === item.row && candidate.col === item.col,
      ),
    })),
    forcedMoveType,
    search: {
      completedDepth: metrics.searchDepth,
      searchedNodes: metrics.searchedNodes,
      cutoffCount: metrics.cutoffCount,
      cacheHits: metrics.cacheHits,
      durationMs: metrics.searchDurationMs,
      timedOut: metrics.timedOut,
    },
    ...(candidates[0]
      ? {
          baselineBest: {
            row: candidates[0].row,
            col: candidates[0].col,
            searchScore: candidates[0].searchScore,
          },
        }
      : {}),
    principalVariation: candidates[0]?.principalVariation ?? [],
    finalSource,
  }
}

function finishForced(
  candidate: AICandidate,
  type: NonNullable<ForcedMoveType>,
  rootPlayer: Player,
  pool: AICandidate[],
  metrics: SearchMetrics,
  started: number,
): SearchResult {
  metrics.searchDurationMs = Date.now() - started
  const candidates = [
    asSearched(
      candidate,
      rootPlayer,
      type === 'forcedWin' ? SEARCH_WIN_SCORE : candidate.orderingScore,
    ),
  ]
  return {
    candidates,
    forcedMoveType: type,
    metrics,
    trace: traceFor(rootPlayer, pool, metrics, type, candidates, type),
  }
}

function findImmediateForcedCandidate(board: Board, rootPlayer: Player): AICandidate | null {
  const winningMove = findWinningMoves(board, rootPlayer)[0]
  if (winningMove) return evaluateCandidate(board, winningMove.row, winningMove.col, rootPlayer)

  const opponentWinningMoves = findWinningMoves(board, other(rootPlayer))
  return opponentWinningMoves.length === 1
    ? evaluateCandidate(
        board,
        opponentWinningMoves[0]!.row,
        opponentWinningMoves[0]!.col,
        rootPlayer,
      )
    : null
}

function restrictToCriticalDefense(board: Board, rootPlayer: Player, pool: AICandidate[]) {
  const defense = inspectGomokuPosition(board, rootPlayer).mandatoryDefense
  if (defense.urgency !== 'nextTurnFork' || defense.unavoidable) return pool
  return defense.moves.map(
    (move) =>
      pool.find((candidate) => candidate.row === move.row && candidate.col === move.col) ??
      evaluateCandidate(board, move.row, move.col, rootPlayer),
  )
}

export function createSafeSearchFallback(board: Board, rootPlayer: Player = 2): SearchResult {
  const started = Date.now()
  const pool = generateCandidatePool(board, rootPlayer)
  const metrics = metricsFor(pool.length)
  const forced = findImmediateForcedCandidate(board, rootPlayer)
  if (forced?.immediateWin)
    return finishForced(forced, 'forcedWin', rootPlayer, pool, metrics, started)
  if (forced?.blocksImmediateWin)
    return finishForced(forced, 'forcedBlock', rootPlayer, pool, metrics, started)
  const safePool = restrictToCriticalDefense(board, rootPlayer, pool)
  const candidates = safePool
    .slice(0, SEARCH_CONFIG.finalCandidateLimit)
    .map((item) => asSearched(item, rootPlayer))
  metrics.searchDurationMs = Date.now() - started
  return {
    candidates,
    forcedMoveType: null,
    metrics,
    trace: traceFor(rootPlayer, pool, metrics, null, candidates, 'searchFallback'),
  }
}

export function searchPosition(boardInput: Board, options: SearchOptions = {}): SearchResult {
  const started = Date.now()
  const rootPlayer = options.rootPlayer ?? 2
  const maxDepth = options.maxDepth ?? SEARCH_CONFIG.maxDepth
  const board = cloneBoard(boardInput)
  const pool = generateCandidatePool(
    board,
    rootPlayer,
    options.candidatePoolLimit ?? SEARCH_CONFIG.candidatePoolLimit,
  )
  const metrics = metricsFor(pool.length)
  const immediate = findImmediateForcedCandidate(board, rootPlayer)
  if (immediate?.immediateWin)
    return finishForced(immediate, 'forcedWin', rootPlayer, pool, metrics, started)
  if (immediate?.blocksImmediateWin)
    return finishForced(immediate, 'forcedBlock', rootPlayer, pool, metrics, started)

  const threat = searchForcedWin(board, rootPlayer, {
    maxPly: options.threatMaxPly ?? SEARCH_CONFIG.threatMaxPly,
    maxMs: Math.min(SEARCH_CONFIG.threatMaxMs, options.maxMs ?? SEARCH_CONFIG.maxMs),
  })
  const threatCandidate =
    threat.forcedWin && threat.winningMove
      ? pool.find(
          (item) => item.row === threat.winningMove!.row && item.col === threat.winningMove!.col,
        )
      : undefined
  if (threatCandidate) {
    metrics.searchedNodes = threat.searchedNodes
    metrics.searchDurationMs = Date.now() - started
    metrics.timedOut = threat.timedOut
    const candidates = [
      asSearched(
        threatCandidate,
        rootPlayer,
        SEARCH_WIN_SCORE - (threat.plyToWin ?? 1),
        threat.principalVariation,
      ),
    ]
    return {
      candidates,
      forcedMoveType: 'forcedTactical',
      metrics,
      trace: traceFor(rootPlayer, pool, metrics, 'forcedTactical', candidates, 'forcedTactical'),
    }
  }

  const rootPool = restrictToCriticalDefense(board, rootPlayer, pool)
  let completed = rootPool.map((item) => asSearched(item, rootPlayer))
  const context: SearchContext = {
    rootPlayer,
    deadline: started + (options.maxMs ?? SEARCH_CONFIG.maxMs),
    branchLimit: options.branchLimit ?? SEARCH_CONFIG.branchLimit,
    useCache: options.useCache ?? true,
    table: new Map(),
    metrics,
    extensionDepth: options.extensionDepth ?? SEARCH_CONFIG.extensionDepth,
    maxExtensionNodes: options.maxExtensionNodes ?? SEARCH_CONFIG.maxExtensionNodes,
  }
  let previousBest: { row: number; col: number } | undefined
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const depthResults: SearchedCandidate[] = []
    const roots = [...rootPool].sort(
      (a, b) =>
        Number(b.row === previousBest?.row && b.col === previousBest?.col) -
          Number(a.row === previousBest?.row && a.col === previousBest?.col) ||
        b.orderingScore - a.orderingScore,
    )
    let layerComplete = true
    for (const candidate of roots) {
      if (Date.now() >= context.deadline) {
        metrics.timedOut = true
        layerComplete = false
        break
      }
      board[candidate.row]![candidate.col] = rootPlayer
      const child = minimax(
        board,
        depth - 1,
        other(rootPlayer),
        -Infinity,
        Infinity,
        candidate,
        1,
        context.extensionDepth,
        context,
      )
      board[candidate.row]![candidate.col] = 0
      if (!child.completed) {
        layerComplete = false
        break
      }
      depthResults.push(
        asSearched(candidate, rootPlayer, child.score, [
          { player: playerName(rootPlayer), row: candidate.row, col: candidate.col },
          ...child.line,
        ]),
      )
    }
    if (!layerComplete || depthResults.length !== rootPool.length) break
    completed = depthResults.sort(
      (a, b) => b.searchScore - a.searchScore || b.staticScore - a.staticScore,
    )
    previousBest = completed[0] ? { row: completed[0].row, col: completed[0].col } : undefined
    metrics.searchDepth = depth
  }
  metrics.searchDurationMs = Date.now() - started
  const candidates = completed.slice(
    0,
    options.finalCandidateLimit ?? SEARCH_CONFIG.finalCandidateLimit,
  )
  return {
    candidates,
    forcedMoveType: null,
    metrics,
    trace: traceFor(rootPlayer, pool, metrics, null, candidates, 'search'),
  }
}

export function searchFixedCandidate(
  boardInput: Board,
  move: { row: number; col: number },
  rootPlayer: Player,
  options: SearchOptions = {},
): FixedCandidateSearchResult {
  if (
    !Number.isInteger(move.row) ||
    !Number.isInteger(move.col) ||
    move.row < 0 ||
    move.row >= BOARD_SIZE ||
    move.col < 0 ||
    move.col >= BOARD_SIZE
  )
    throw new Error('固定候选坐标无效')
  if (boardInput[move.row]?.[move.col] !== 0) throw new Error('固定候选必须是空位')
  const started = Date.now()
  const board = cloneBoard(boardInput)
  board[move.row]![move.col] = rootPlayer
  const maxDepth = options.maxDepth ?? SEARCH_CONFIG.maxDepth
  const metrics = metricsFor(1)
  const context: SearchContext = {
    rootPlayer,
    deadline: started + (options.maxMs ?? SEARCH_CONFIG.maxMs),
    branchLimit: options.branchLimit ?? SEARCH_CONFIG.branchLimit,
    useCache: options.useCache ?? true,
    table: new Map(),
    metrics,
    extensionDepth: options.extensionDepth ?? SEARCH_CONFIG.extensionDepth,
    maxExtensionNodes: options.maxExtensionNodes ?? SEARCH_CONFIG.maxExtensionNodes,
  }
  const rootStep: PrincipalVariationMove = {
    player: playerName(rootPlayer),
    row: move.row,
    col: move.col,
  }
  const terminal = getSearchTerminalScore(board, move.row, move.col, 1, rootPlayer)
  if (terminal !== null) {
    return {
      move: { ...move },
      searchScore: terminal,
      completedDepth: 1,
      timedOut: false,
      principalVariation: [rootStep],
      forcedWin: terminal > 0,
      metrics: {
        searchedNodes: 0,
        cacheHits: 0,
        cutoffs: 0,
        durationMs: Date.now() - started,
        ttStores: 0,
        extensionNodes: 0,
      },
    }
  }

  let completedScore = evaluatePosition(board, rootPlayer, other(rootPlayer))
  let completedLine: PrincipalVariationMove[] = [rootStep]
  let completedDepth = 0
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    if (Date.now() >= context.deadline) {
      metrics.timedOut = true
      break
    }
    const child = minimax(
      board,
      depth - 1,
      other(rootPlayer),
      -Infinity,
      Infinity,
      move,
      1,
      context.extensionDepth,
      context,
    )
    if (!child.completed) break
    completedScore = child.score
    completedLine = [rootStep, ...child.line]
    completedDepth = depth
  }
  metrics.searchDepth = completedDepth
  metrics.searchDurationMs = Date.now() - started
  const reply = completedLine[1]
  return {
    move: { ...move },
    searchScore: completedScore,
    completedDepth,
    timedOut: metrics.timedOut,
    principalVariation: completedLine,
    forcedWin: completedScore >= SEARCH_WIN_SCORE - 1_000,
    ...(reply ? { opponentBestReply: { row: reply.row, col: reply.col } } : {}),
    metrics: {
      searchedNodes: metrics.searchedNodes,
      cacheHits: metrics.cacheHits,
      cutoffs: metrics.cutoffCount,
      durationMs: metrics.searchDurationMs,
      ttStores: metrics.ttStores,
      extensionNodes: metrics.extensionNodes,
    },
  }
}
