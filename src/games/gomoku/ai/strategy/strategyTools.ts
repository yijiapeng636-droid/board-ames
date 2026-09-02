import { evaluateCandidate } from '@/games/gomoku/ai/candidates'
import type { SearchOptions } from '@/games/gomoku/ai/search'
import { BOARD_LAST_INDEX, BOARD_SIZE } from '@/games/gomoku/types/gomoku'
import type {
  GomokuAgentContext,
  GomokuStrategyTool,
  StrategyMode,
  StrategyPosition,
} from './strategyTypes'

const MODES: Record<StrategyMode, SearchOptions> = {
  quick: { maxDepth: 2, maxMs: 350, branchLimit: 5 },
  normal: { maxDepth: 3, maxMs: 900, branchLimit: 7 },
  deep: { maxDepth: 5, maxMs: 1_800, branchLimit: 8 },
  forcing: { maxDepth: 4, maxMs: 1_200, branchLimit: 6, extensionDepth: 2 },
}
const MOVE_SCHEMA = {
  type: 'object',
  properties: {
    row: { type: 'integer', minimum: 0, maximum: BOARD_LAST_INDEX },
    col: { type: 'integer', minimum: 0, maximum: BOARD_LAST_INDEX },
  },
  required: ['row', 'col'],
  additionalProperties: false,
} as const
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const sameMove = (candidate: StrategyPosition, move: StrategyPosition) =>
  candidate.row === move.row && candidate.col === move.col

function parseMove(value: unknown, context: GomokuAgentContext): StrategyPosition {
  if (!isRecord(value) || !Number.isInteger(value.row) || !Number.isInteger(value.col))
    throw new Error('move.row/col must be integers')
  const move = { row: value.row as number, col: value.col as number }
  if (move.row < 0 || move.row >= BOARD_SIZE || move.col < 0 || move.col >= BOARD_SIZE)
    throw new Error('Tool move is out of bounds')
  if (context.board[move.row]?.[move.col] !== 0) throw new Error('Tool move is occupied')
  if (!context.allowedCandidates.some((candidate) => sameMove(candidate, move)))
    throw new Error('Tool move is outside allowedCandidates')
  return move
}
function parseMode(value: unknown, allowed: StrategyMode[]): StrategyMode {
  if (typeof value !== 'string' || !allowed.includes(value as StrategyMode))
    throw new Error(`mode must be ${allowed.join(' | ')}`)
  return value as StrategyMode
}
async function searchForced(input: unknown, context: GomokuAgentContext, signal: AbortSignal) {
  const move = isRecord(input) && input.move !== undefined ? parseMove(input.move, context) : null
  const options = { maxPly: 11, maxMs: 900, maxNodes: 8_000 }
  const result = move
    ? await context.runThreatSearchFromMove(context.board, context.aiPlayer, move, options, signal)
    : await context.runThreatSearch(context.board, context.aiPlayer, options, signal)
  return { ...result, analyzedMove: move }
}
async function analyzeCandidate(
  move: StrategyPosition,
  mode: StrategyMode,
  context: GomokuAgentContext,
  signal: AbortSignal,
) {
  const fixedSearch = await context.runFixedSearch(
    context.board,
    move,
    context.aiPlayer,
    MODES[mode],
    signal,
  )
  const facts = evaluateCandidate(context.board, move.row, move.col, context.aiPlayer)
  const baseline = context.baselineSearch.candidates.find((candidate) => sameMove(candidate, move))
  return {
    move,
    attackScore: facts.attackScore,
    defenseScore: facts.defenseScore,
    positionalScore: facts.positionalScore,
    orderingScore: facts.orderingScore,
    tacticalFacts: {
      immediateWin: facts.immediateWin,
      blocksImmediateWin: facts.blocksImmediateWin,
      createsDoubleThreat: facts.createsDoubleThreat,
      createsFourThree: facts.createsFourThree,
      forcesReply: facts.forcesReply,
      pureDefense: facts.pureDefense,
    },
    searchScore: fixedSearch.searchScore,
    completedDepth: fixedSearch.completedDepth,
    timedOut: fixedSearch.timedOut,
    principalVariation: fixedSearch.principalVariation,
    forcedWin: fixedSearch.forcedWin,
    opponentBestReply: fixedSearch.opponentBestReply ?? null,
    metrics: fixedSearch.metrics,
    baselineSearchScore: baseline?.searchScore ?? null,
    baselinePrincipalVariation: baseline?.principalVariation ?? [],
  }
}
async function compareCandidates(input: unknown, context: GomokuAgentContext, signal: AbortSignal) {
  if (
    !isRecord(input) ||
    !Array.isArray(input.moves) ||
    input.moves.length < 2 ||
    input.moves.length > 4
  )
    throw new Error('moves must contain 2 to 4 candidates')
  const mode = parseMode(input.mode, ['quick', 'normal'])
  const moves = input.moves.map((move) => parseMove(move, context))
  if (new Set(moves.map((move) => `${move.row},${move.col}`)).size !== moves.length)
    throw new Error('moves must not contain duplicates')
  const results = []
  for (const move of moves) results.push(await analyzeCandidate(move, mode, context, signal))
  return results
}
export const gomokuStrategyTools: GomokuStrategyTool[] = [
  {
    name: 'search_forced_win',
    description: 'Prove whether the position or one allowed candidate has a forced win.',
    inputSchema: { type: 'object', properties: { move: MOVE_SCHEMA }, additionalProperties: false },
    execute: searchForced,
  },
  {
    name: 'search_candidate',
    description: 'Analyze one allowed candidate against the opponent best reply.',
    inputSchema: {
      type: 'object',
      properties: {
        move: MOVE_SCHEMA,
        mode: { type: 'string', enum: ['quick', 'normal', 'deep', 'forcing'] },
      },
      required: ['move', 'mode'],
      additionalProperties: false,
    },
    execute: async (input, context, signal) => {
      if (!isRecord(input)) throw new Error('Tool input must be an object')
      return analyzeCandidate(
        parseMove(input.move, context),
        parseMode(input.mode, ['quick', 'normal', 'deep', 'forcing']),
        context,
        signal,
      )
    },
  },
  {
    name: 'compare_candidates',
    description: 'Compare 2 to 4 allowed candidates using tactical facts, fixed search and PV.',
    inputSchema: {
      type: 'object',
      properties: {
        moves: { type: 'array', items: MOVE_SCHEMA, minItems: 2, maxItems: 4 },
        mode: { type: 'string', enum: ['quick', 'normal'] },
      },
      required: ['moves', 'mode'],
      additionalProperties: false,
    },
    execute: compareCandidates,
  },
]
