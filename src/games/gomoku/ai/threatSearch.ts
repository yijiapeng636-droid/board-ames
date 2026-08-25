import { generateCandidatePool } from '@/games/gomoku/ai/candidates'
import { getWinner } from '@/games/gomoku/core/winner'
import { BOARD_SIZE, type Board, type Player, type PrincipalVariationMove, type ThreatProofStatus } from '@/games/gomoku/types/gomoku'

export interface ThreatSearchOptions { maxPly?: number; maxNodes?: number; maxMs?: number }
export interface ThreatSearchResult {
  status: ThreatProofStatus
  found: boolean
  forcedWin: boolean
  winningMove?: { row: number; col: number }
  plyToWin?: number
  principalVariation: PrincipalVariationMove[]
  searchedNodes: number
  durationMs: number
  timedOut: boolean
}

function playerName(player: Player): 'black' | 'white' { return player === 1 ? 'black' : 'white' }
function other(player: Player): Player { return player === 1 ? 2 : 1 }

function proveThreat(
  board: Board,
  attacker: Player,
  initialSide: Player,
  initialPly: number,
  options: ThreatSearchOptions,
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

  function prove(side: Player, ply: number): { win: boolean; line: PrincipalVariationMove[] } {
    if (stopped() || ply >= maxPly) return { win: false, line: [] }
    nodes += 1
    const pool = generateCandidatePool(board, side, 20)
    if (side === attacker) {
      const forcing = pool.filter((move) => move.immediateWin || move.forcesReply || move.createsDoubleThreat || move.createsFourThree)
      for (const move of forcing) {
        board[move.row]![move.col] = side
        const child = getWinner(board, move.row, move.col) === attacker
          ? { win: true, line: [] }
          : prove(other(side), ply + 1)
        board[move.row]![move.col] = 0
        if (child.win) return { win: true, line: [{ player: playerName(side), row: move.row, col: move.col }, ...child.line] }
        if (stopped()) break
      }
      return { win: false, line: [] }
    }

    // A defender's own immediate win refutes the attack before any blocking line is considered.
    if (pool.some((move) => move.immediateWin)) return { win: false, line: [] }
    const attackerWins = generateCandidatePool(board, attacker, 20).filter((move) => move.immediateWin)
    if (attackerWins.length === 0) return { win: false, line: [] }
    const replies = pool.filter((move) => move.blocksImmediateWin)
    if (replies.length === 0) return { win: true, line: [] }
    let representativeLine: PrincipalVariationMove[] = []
    for (const reply of replies) {
      board[reply.row]![reply.col] = side
      const child = prove(attacker, ply + 1)
      board[reply.row]![reply.col] = 0
      // The proof is an AND node: every legal immediate defense must still lose.
      if (!child.win || stopped()) return { win: false, line: [] }
      const line = [{ player: playerName(side), row: reply.row, col: reply.col } as PrincipalVariationMove, ...child.line]
      if (line.length > representativeLine.length) representativeLine = line
    }
    return { win: true, line: representativeLine }
  }

  const proof = prove(initialSide, initialPly)
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
  move: { row: number; col: number },
  options: ThreatSearchOptions = {},
): ThreatSearchResult {
  if (!Number.isInteger(move.row) || !Number.isInteger(move.col) || move.row < 0 || move.row >= BOARD_SIZE || move.col < 0 || move.col >= BOARD_SIZE) throw new Error('指定强制胜候选坐标无效')
  if (boardInput[move.row]?.[move.col] !== 0) throw new Error('指定强制胜候选必须是空位')
  const started = Date.now()
  const board = boardInput.map((line) => [...line])
  board[move.row]![move.col] = attacker
  const root: PrincipalVariationMove = { player: playerName(attacker), row: move.row, col: move.col }
  if (getWinner(board, move.row, move.col) === attacker) {
    return { status: 'proven_win', found: true, forcedWin: true, winningMove: { ...move }, plyToWin: 1, principalVariation: [root], searchedNodes: 0, durationMs: Date.now() - started, timedOut: false }
  }
  const result = proveThreat(board, attacker, other(attacker), 1, options)
  const normalized = asResult(result.proof, result.nodes, result.timedOut, Date.now() - started)
  if (!normalized.forcedWin) return normalized
  const line = [root, ...normalized.principalVariation]
  return { ...normalized, winningMove: { ...move }, plyToWin: line.length, principalVariation: line }
}
