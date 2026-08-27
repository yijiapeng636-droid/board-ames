import { generateCandidatePool } from '@/games/gomoku/ai/candidates'
import {
  analyzeThreat,
  type ThreatAnalysis,
  type ThreatPosition,
} from '@/games/gomoku/ai/threatAnalysis'
import { getWinner } from '@/games/gomoku/core/winner'
import { BOARD_SIZE, type Board, type Player, type PrincipalVariationMove, type ThreatProofStatus } from '@/games/gomoku/types/gomoku'

export interface ThreatSearchOptions { maxPly?: number; maxNodes?: number; maxMs?: number }
export interface ThreatSearchResult {
  status: ThreatProofStatus
  found: boolean
  forcedWin: boolean
  winningMove?: ThreatPosition
  plyToWin?: number
  principalVariation: PrincipalVariationMove[]
  searchedNodes: number
  durationMs: number
  timedOut: boolean
}

function playerName(player: Player): 'black' | 'white' { return player === 1 ? 'black' : 'white' }
function other(player: Player): Player { return player === 1 ? 2 : 1 }
function same(left: ThreatPosition, right: ThreatPosition) { return left.row === right.row && left.col === right.col }
function moveKey(move: ThreatPosition) { return `${move.row}:${move.col}` }

function uniqueMoves(moves: ThreatPosition[]) {
  const unique = new Map<string, ThreatPosition>()
  for (const move of moves) unique.set(moveKey(move), move)
  return [...unique.values()]
}

function proveThreat(
  board: Board,
  attacker: Player,
  initialSide: Player,
  initialPly: number,
  options: ThreatSearchOptions,
  initialThreat?: Pick<ThreatAnalysis, 'winningMoves' | 'defenseSquares'>,
) {
  const started = Date.now()
  const deadline = started + (options.maxMs ?? 220)
  const maxPly = options.maxPly ?? 9
  const maxNodes = options.maxNodes ?? 4_000
  let nodes = 0
  let timedOut = false

  function stopped() {
    const stop = Date.now() >= deadline || nodes >= maxNodes
    if (stop) timedOut = true
    return stop
  }

  function proveAttacker(ply: number): { win: boolean; line: PrincipalVariationMove[] } {
    const defender = other(attacker)
    const attackerPool = generateCandidatePool(board, attacker, 24)
    const immediateWins = attackerPool.filter((move) => move.immediateWin)
    if (immediateWins[0]) {
      const move = immediateWins[0]
      return { win: true, line: [{ player: playerName(attacker), row: move.row, col: move.col }] }
    }

    const defenderWins = generateCandidatePool(board, defender, 24).filter((move) => move.immediateWin)
    if (defenderWins.length > 1) return { win: false, line: [] }

    const forcing = defenderWins.length === 1
      ? attackerPool.filter((move) => same(move, defenderWins[0]!))
      : attackerPool.filter((move) => {
          if (move.immediateWin || move.forcesReply || move.createsDoubleThreat || move.createsFourThree) return true
          return analyzeThreat(board, move, attacker).openThrees.length > 0
        })

    for (const move of forcing) {
      board[move.row]![move.col] = attacker
      const local = analyzeThreat(board, move, attacker)
      const child = local.winNow
        ? { win: true, line: [] }
        : prove(defender, ply + 1, local)
      board[move.row]![move.col] = 0
      if (child.win) {
        return {
          win: true,
          line: [{ player: playerName(attacker), row: move.row, col: move.col }, ...child.line],
        }
      }
      if (stopped()) break
    }
    return { win: false, line: [] }
  }

  function proveDefender(ply: number, threat: Pick<ThreatAnalysis, 'winningMoves' | 'defenseSquares'> | undefined): { win: boolean; line: PrincipalVariationMove[] } {
    if (!threat) return { win: false, line: [] }
    const defender = other(attacker)
    const defenderPool = generateCandidatePool(board, defender, 40)

    // A defender that can win now refutes the attack instead of entering a blocking branch.
    if (defenderPool.some((move) => move.immediateWin)) return { win: false, line: [] }

    // One stone cannot cover two distinct immediate winning squares. Keep one
    // representative block-and-win continuation so PV ends at an actual five.
    if (threat.winningMoves.length > 1) {
      const blocked = threat.winningMoves[0]!
      const winning = threat.winningMoves[1]!
      return {
        win: true,
        line: [
          { player: playerName(defender), row: blocked.row, col: blocked.col },
          { player: playerName(attacker), row: winning.row, col: winning.col },
        ],
      }
    }

    let replies: ThreatPosition[]
    if (threat.winningMoves.length === 1) {
      replies = [{ ...threat.winningMoves[0]! }]
    } else {
      const counterForcing = defenderPool.filter((move) =>
        move.forcesReply || move.createsDoubleThreat || move.createsFourThree,
      )
      replies = uniqueMoves([
        ...threat.defenseSquares,
        ...counterForcing.map(({ row, col }) => ({ row, col })),
      ])
    }

    replies = replies.filter((move) => board[move.row]?.[move.col] === 0)
    if (replies.length === 0) return { win: false, line: [] }

    let representativeLine: PrincipalVariationMove[] = []
    for (const reply of replies) {
      board[reply.row]![reply.col] = defender
      if (getWinner(board, reply.row, reply.col) === defender) {
        board[reply.row]![reply.col] = 0
        return { win: false, line: [] }
      }
      const child = prove(attacker, ply + 1)
      board[reply.row]![reply.col] = 0
      // This is an AND node: every effective defense and forcing counter must still lose.
      if (!child.win || stopped()) return { win: false, line: [] }
      const line = [
        { player: playerName(defender), row: reply.row, col: reply.col } as PrincipalVariationMove,
        ...child.line,
      ]
      if (line.length > representativeLine.length) representativeLine = line
    }
    return { win: true, line: representativeLine }
  }

  function prove(
    side: Player,
    ply: number,
    threat?: Pick<ThreatAnalysis, 'winningMoves' | 'defenseSquares'>,
  ): { win: boolean; line: PrincipalVariationMove[] } {
    if (stopped() || ply >= maxPly) return { win: false, line: [] }
    nodes += 1
    return side === attacker ? proveAttacker(ply) : proveDefender(ply, threat)
  }

  const proof = prove(initialSide, initialPly, initialThreat)
  return { proof, nodes, timedOut, durationMs: Date.now() - started }
}

function asResult(
  proof: { win: boolean; line: PrincipalVariationMove[] },
  nodes: number,
  timedOut: boolean,
  durationMs: number,
): ThreatSearchResult {
  const proven = proof.win && !timedOut
  const status: ThreatProofStatus = proven ? 'proven_win' : timedOut ? 'timeout' : 'not_proven'
  return {
    status,
    found: proven,
    forcedWin: proven,
    ...(proven && proof.line[0] ? { winningMove: { row: proof.line[0].row, col: proof.line[0].col }, plyToWin: proof.line.length } : {}),
    principalVariation: proven ? proof.line : [],
    searchedNodes: nodes,
    durationMs,
    timedOut,
  }
}

export function searchForcedWin(boardInput: Board, attacker: Player, options: ThreatSearchOptions = {}): ThreatSearchResult {
  const board = boardInput.map((line) => [...line])
  const result = proveThreat(board, attacker, attacker, 0, options)
  return asResult(result.proof, result.nodes, result.timedOut, result.durationMs)
}

export function searchForcedWinFromMove(
  boardInput: Board,
  attacker: Player,
  move: ThreatPosition,
  options: ThreatSearchOptions = {},
): ThreatSearchResult {
  if (!Number.isInteger(move.row) || !Number.isInteger(move.col) || move.row < 0 || move.row >= BOARD_SIZE || move.col < 0 || move.col >= BOARD_SIZE) throw new Error('指定强制胜候选坐标无效')
  if (boardInput[move.row]?.[move.col] !== 0) throw new Error('指定强制胜候选必须是空位')
  const started = Date.now()
  const board = boardInput.map((line) => [...line])
  board[move.row]![move.col] = attacker
  const root: PrincipalVariationMove = { player: playerName(attacker), row: move.row, col: move.col }
  const analysis = analyzeThreat(board, move, attacker)
  if (analysis.winNow) {
    return { status: 'proven_win', found: true, forcedWin: true, winningMove: { ...move }, plyToWin: 1, principalVariation: [root], searchedNodes: 0, durationMs: Date.now() - started, timedOut: false }
  }
  const result = proveThreat(board, attacker, other(attacker), 1, options, analysis)
  const normalized = asResult(result.proof, result.nodes, result.timedOut, Date.now() - started)
  if (!normalized.forcedWin) return normalized
  const line = [root, ...normalized.principalVariation]
  return { ...normalized, winningMove: { ...move }, plyToWin: line.length, principalVariation: line }
}
