import { describe, expect, it } from 'vitest'
import type { AgentTransport } from '@/ai/runtime/agentTypes'
import { evaluateCandidate, generateCandidatePool } from '@/games/gomoku/ai/candidates'
import { searchPosition } from '@/games/gomoku/ai/search'
import { buildGomokuAgentContext } from '@/games/gomoku/ai/strategy/agentConfig'
import { runGomokuStrategyAgent } from '@/games/gomoku/ai/strategy/gomokuAgent'
import { searchForcedWin } from '@/games/gomoku/ai/threatSearch'
import { createBoard } from '@/games/gomoku/core/game'
import type { Board, Player } from '@/games/gomoku/types/gomoku'

interface Fixture {
  name: string
  purpose: string
  root: Player
  pieces: Array<[number, number, Player]>
  expected: 'win' | 'block' | 'tactical' | 'search'
}

const fixtures: Fixture[] = [
  { name: 'immediate-win-white', purpose: '规则已证明的一步五连必须越过 Agent', root: 2, pieces: [[7, 3, 2], [7, 4, 2], [7, 5, 2], [7, 6, 2]], expected: 'win' },
  { name: 'mandatory-block-black-ai', purpose: '黑方 AI 无己方立即胜时必须阻挡白方五连', root: 1, pieces: [[5, 8, 2], [6, 8, 2], [7, 8, 2], [8, 8, 2]], expected: 'block' },
  { name: 'forcing-attack-over-development', purpose: '己方开放三连的强制进攻不应让位于对手普通发展点', root: 2, pieces: [[7, 5, 2], [7, 6, 2], [7, 7, 2], [4, 4, 1], [4, 5, 1]], expected: 'tactical' },
  { name: 'double-threat-center', purpose: '交叉双活三经全防守分支证明后必须升级为强制战术', root: 2, pieces: [[7, 5, 2], [7, 6, 2], [5, 7, 2], [6, 7, 2], [10, 10, 1]], expected: 'tactical' },
  { name: 'static-trap', purpose: '深层结果必须独立于 orderingScore 排名', root: 2, pieces: [[5, 5, 2], [5, 6, 2], [7, 5, 1], [7, 6, 1], [6, 7, 2], [8, 7, 1], [9, 8, 2], [6, 8, 1]], expected: 'search' },
  { name: 'black-perspective', purpose: '同一搜索实现支持黑方主动进攻', root: 1, pieces: [[8, 4, 1], [8, 5, 1], [8, 6, 1], [3, 3, 2]], expected: 'tactical' },
  { name: 'white-perspective', purpose: '同一搜索实现支持白方主动进攻', root: 2, pieces: [[9, 4, 2], [9, 5, 2], [9, 6, 2], [3, 3, 1]], expected: 'tactical' },
]

function makeBoard(fixture: Fixture) {
  const board = createBoard()
  for (const [row, col, player] of fixture.pieces) board[row]![col] = player
  return board
}

function scriptedAgent(row: number, col: number): AgentTransport {
  return {
    complete: async () => {
      return { message: { role: 'assistant', content: JSON.stringify({ status: 'decision', move: { row, col }, strategy: 'positional', reason: 'scripted benchmark selects the local-search leader', evidence: ['position_inspection', 'baseline_search'] }) }, finishReason: 'stop' }
    },
  }
}

describe('fixed gomoku AI benchmark', () => {
  it.each(fixtures)('$name', async (fixture) => {
      const board = makeBoard(fixture)
      const oldBaseline = generateCandidatePool(board, fixture.root)[0]
      const local = searchPosition(board, { rootPlayer: fixture.root, maxDepth: 3, maxMs: 2_000 })
      const localBest = local.candidates[0]
      if (!localBest) throw new Error(`No candidate: ${fixture.purpose}`)

      let agent: { move: [number, number]; calls: string[]; fallback: boolean } | 'bypassed-deterministic'
      if (local.forcedMoveType) {
        agent = 'bypassed-deterministic'
      } else {
        const context = buildGomokuAgentContext(board, [], fixture.root, fixture.root === 1 ? 2 : 1, fixture.root, local)
        const result = await runGomokuStrategyAgent(context, undefined, undefined, scriptedAgent(localBest!.row, localBest!.col))
        agent = { move: [result.decision.row, result.decision.col], calls: result.trace.toolCalls.map((call) => call.name), fallback: result.source === 'fallback' }
      }

      const expectedAgent = local.forcedMoveType
        ? 'bypassed-deterministic'
        : { move: [localBest.row, localBest.col], calls: [], fallback: false }
      expect(agent).toEqual(expectedAgent)

      console.info(`GOMOKU_V3_BENCH ${JSON.stringify({ name: fixture.name, purpose: fixture.purpose, oldBaseline: oldBaseline ? [oldBaseline.row, oldBaseline.col] : null, oldPureDefense: oldBaseline?.pureDefense ?? null, local: [localBest!.row, localBest!.col], localForcing: localBest!.features.some((feature) => ['openFour', 'closedFour', 'doubleThreat', 'fourThree'].includes(feature)), forced: local.forcedMoveType, depth: local.metrics.searchDepth, nodes: local.metrics.searchedNodes, durationMs: local.metrics.searchDurationMs, cacheHits: local.metrics.cacheHits, ttStores: local.metrics.ttStores, cutoffCount: local.metrics.cutoffCount, timedOut: local.metrics.timedOut, pv: localBest!.principalVariation, agent })}`)

      const expectedForced = { win: 'forcedWin', block: 'forcedBlock', tactical: 'forcedTactical', search: null } as const
      expect(local.forcedMoveType).toBe(expectedForced[fixture.expected])
      expect(local.metrics.searchDepth).toBeGreaterThanOrEqual(fixture.expected === 'search' ? 1 : 0)
  })

  it('proves an open-four forced sequence and reports plyToWin', () => {
    const board = createBoard()
    board[7]![5] = 2
    board[7]![6] = 2
    board[7]![7] = 2
    const result = searchForcedWin(board, 2, { maxPly: 7, maxMs: 1_000, maxNodes: 5_000 })
    expect(result.forcedWin).toBe(true)
    expect(result.plyToWin).toBe(result.principalVariation.length)
    expect(result.principalVariation.length).toBeGreaterThanOrEqual(3)
  })

  it('protects tactical candidates before nominal pruning', () => {
    const board: Board = createBoard()
    board[7]![5] = 2
    board[7]![6] = 2
    board[5]![7] = 2
    board[6]![7] = 2
    const center = evaluateCandidate(board, 7, 7, 2)
    const pool = generateCandidatePool(board, 2, 1)
    expect(center.createsDoubleThreat).toBe(true)
    expect(pool.some((candidate) => candidate.row === 7 && candidate.col === 7)).toBe(true)
  })
})
