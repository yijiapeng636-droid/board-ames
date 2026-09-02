import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentTransport } from '@/ai/runtime/agentTypes'
import { buildGomokuAgentContext } from '@/games/gomoku/ai/strategy/agentConfig'
import {
  createGomokuFallback,
  parseGomokuDecision,
  runGomokuStrategyAgent,
} from '@/games/gomoku/ai/strategy/gomokuAgent'
import { inspectGomokuPosition } from '@/games/gomoku/ai/strategy/positionInspection'
import {
  validateGomokuTacticalGate,
  verifyGomokuAgentDecisionSafety,
} from '@/games/gomoku/ai/strategy/tacticalGate'
import { createBoard } from '@/games/gomoku/core/game'
import type { SearchResult } from '@/games/gomoku/types/gomoku'

const baseline: SearchResult = {
  candidates: [{ row: 7, col: 7, staticScore: 10, searchScore: 20, features: ['center'], principalVariation: [{ player: 'black', row: 7, col: 7 }] }, { row: 7, col: 8, staticScore: 9, searchScore: 19, features: [], principalVariation: [] }], forcedMoveType: null,
  metrics: { candidateCount: 2, searchedNodes: 1, searchDepth: 1, searchDurationMs: 1, cutoffCount: 0, cacheHits: 0, ttStores: 0, extensionNodes: 0, timedOut: false },
  trace: { aiPlayer: 1, sideToMove: 1, generatedCandidateCount: 2, candidates: [], forcedMoveType: null, search: { completedDepth: 1, searchedNodes: 1, cutoffCount: 0, cacheHits: 0, durationMs: 1, timedOut: false }, principalVariation: [], finalSource: 'search' },
}
const envelope = (row: number, col: number, extra: Record<string, unknown> = {}) => JSON.stringify({ status: 'decision', move: { row, col }, strategy: 'positional', reason: 'center', evidence: ['baseline'], ...extra })
const model = (content: string): AgentTransport => ({ complete: async () => ({ message: { role: 'assistant', content }, finishReason: 'stop' }) })
afterEach(() => vi.restoreAllMocks())

describe('Gomoku strategy agent final protocol', () => {
  it('accepts the decision envelope and exposes AI-relative inspection', async () => {
    const context = buildGomokuAgentContext(createBoard(), [], 1, 2, 1, baseline)
    expect(context.positionInspection).toMatchObject({ aiPlayer: 'black', mandatoryDefense: { required: false } })
    const result = await runGomokuStrategyAgent(context, undefined, undefined, model(envelope(7, 7)))
    expect(result.source).toBe('agent'); expect(result.decision).toMatchObject({ row: 7, col: 7 })
  })
  it('accepts one JSON envelope wrapped in a Markdown code fence or BOM', () => {
    const json = envelope(7, 7, { reason: '选择中心落点', evidence: ['本地搜索'] })
    expect(parseGomokuDecision(`\uFEFF\n\`\`\`json\n${json}\n\`\`\``)).toMatchObject({ row: 7, col: 7 })
  })
  it('normalizes soft metadata without discarding a valid move', () => {
    expect(parseGomokuDecision(envelope(7, 7, { strategy: 'attack', reason: null, evidence: {} }))).toEqual({ row: 7, col: 7, strategy: 'positional', reason: '', evidence: [] })
  })

  it('normalizes English player-facing explanations to Simplified Chinese', () => {
    expect(parseGomokuDecision(envelope(7, 7)).reason).toBe('AI 根据本地局面分析选择了这个落点。')
    expect(parseGomokuDecision(envelope(7, 7)).evidence).toEqual(['AI 策略分析结果'])
  })
  it.each([
    ['invalid JSON', 'x', 'invalid_final_json'],
    ['invalid status', JSON.stringify({ status: 'other' }), 'invalid_final_status'],
    ['invalid move', envelope(20, 7), 'invalid_final_move'],
    ['fallback request', JSON.stringify({ status: 'fallback_required', reason: 'insufficient' }), 'fallback_requested'],
    ['outside candidates', envelope(0, 0), 'move_outside_candidate_set'],
  ])('falls back with a precise reason for %s', async (_label, content, reason) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runGomokuStrategyAgent(buildGomokuAgentContext(createBoard(), [], 1, 2, 1, baseline), undefined, undefined, model(content))
    expect(result.source).toBe('fallback'); expect(result.trace.fallbackReason).toBe(reason); expect(warning).toHaveBeenCalledWith('[GomokuAgent fallback]', result.trace)
  })

  it('records a safe response preview when JSON parsing fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runGomokuStrategyAgent(
      buildGomokuAgentContext(createBoard(), [], 1, 2, 1, baseline),
      undefined,
      undefined,
      model('我建议选择中心点'),
    )
    expect(result.trace.failure).toMatchObject({
      stage: 'final_parse',
      detail: expect.stringContaining('我建议选择中心点'),
    })
    expect(warning).toHaveBeenCalledOnce()
  })
})

describe('Gomoku tactical gate', () => {
  it('treats an opponent open three as a next-turn-fork mandatory defense', () => {
    const board = createBoard()
    board[7]![6] = 2
    board[7]![7] = 2
    board[7]![8] = 2

    expect(inspectGomokuPosition(board, 1)).toMatchObject({
      opponentImmediateWins: [],
      mandatoryDefense: {
        required: true,
        urgency: 'nextTurnFork',
        unavoidable: false,
        moves: [{ row: 7, col: 5 }, { row: 7, col: 9 }],
      },
    })
  })

  it('rejects a mandatory-defense violation', () => {
    const context = buildGomokuAgentContext(createBoard(), [], 1, 2, 1, baseline)
    const guarded = { ...context, positionInspection: { ...context.positionInspection, mandatoryDefense: { required: true, urgency: 'immediateWin' as const, unavoidable: false, moves: [{ row: 7, col: 7 }] } } }
    expect(validateGomokuTacticalGate({ row: 7, col: 8, strategy: 'positional', reason: '', evidence: [] }, guarded)).toBe('mandatory_defense_violation')
  })
  it('keeps an immediate win above mandatory defense', () => {
    const board = createBoard()
    for (let col = 3; col < 7; col += 1) board[7]![col] = 1
    const built = buildGomokuAgentContext(board, [], 1, 2, 1, baseline)
    const context = {
      ...built,
      positionInspection: {
        ...built.positionInspection,
        mandatoryDefense: { required: true, urgency: 'nextTurnFork' as const, unavoidable: false, moves: [] },
      },
    }
    expect(validateGomokuTacticalGate(
      { row: 7, col: 7, strategy: 'forced_attack', reason: '', evidence: [] },
      context,
    )).toBeNull()
  })
  it('rejects deviation from a proven local result and accepts a normal candidate', () => {
    const context = buildGomokuAgentContext(createBoard(), [], 1, 2, 1, baseline)
    const forced = { ...context, baselineSearch: { ...context.baselineSearch, forcedMoveType: 'forcedWin' as const } }
    expect(validateGomokuTacticalGate({ row: 7, col: 8, strategy: 'positional', reason: '', evidence: [] }, forced)).toBe('forced_result_violation')
    expect(validateGomokuTacticalGate({ row: 7, col: 8, strategy: 'positional', reason: '', evidence: [] }, context)).toBeNull()
  })

  it('rejects an agent move that fixed-candidate search scores far below local best', async () => {
    const built = buildGomokuAgentContext(createBoard(), [], 1, 2, 1, {
      ...baseline,
      candidates: [
        { ...baseline.candidates[0]!, searchScore: 25_000 },
        { ...baseline.candidates[1]!, searchScore: -99_000 },
      ],
    })
    const context = {
      ...built,
      runFixedSearch: vi.fn(async (_board, move) => ({
        move,
        searchScore: -99_000,
        completedDepth: 3,
        timedOut: false,
        principalVariation: [],
        forcedWin: false,
        metrics: { searchedNodes: 1, cacheHits: 0, cutoffs: 0, durationMs: 1, ttStores: 0, extensionNodes: 0 },
      })),
    }

    await expect(verifyGomokuAgentDecisionSafety(
      { row: 7, col: 8, strategy: 'positional', reason: '', evidence: [] },
      context,
      new AbortController().signal,
    )).resolves.toBe('forced_result_violation')
  })

  it('uses a mandatory next-turn-fork defense instead of an unsafe baseline fallback', () => {
    const board = createBoard()
    board[7]![6] = 2
    board[7]![7] = 2
    board[7]![8] = 2
    const unsafeBaseline = {
      ...baseline,
      candidates: [
        { ...baseline.candidates[0]!, row: 5, col: 5 },
        { ...baseline.candidates[1]!, row: 7, col: 5 },
      ],
    }
    const context = buildGomokuAgentContext(board, [], 1, 2, 1, unsafeBaseline)

    expect(createGomokuFallback(context, 'mandatory_defense_violation')).toMatchObject({
      row: 7,
      col: 5,
      strategy: 'mandatory_defense',
    })
  })

  it('checks after-position safety even when Agent agrees with baseline best', async () => {
    const board = createBoard()
    board[7]![6] = 2
    board[7]![7] = 2
    board[7]![8] = 2
    const unsafeBaseline = {
      ...baseline,
      candidates: [{ ...baseline.candidates[0]!, row: 5, col: 5 }],
    }
    const context = buildGomokuAgentContext(board, [], 1, 2, 1, unsafeBaseline)

    await expect(verifyGomokuAgentDecisionSafety(
      { row: 5, col: 5, strategy: 'initiative', reason: '', evidence: [] },
      context,
      new AbortController().signal,
    )).resolves.toBe('mandatory_defense_violation')
  })
})
