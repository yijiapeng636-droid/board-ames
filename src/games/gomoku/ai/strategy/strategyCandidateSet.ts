import { evaluateCandidate, generateCandidatePool } from '@/games/gomoku/ai/candidates'
import { SEARCH_CONFIG } from '@/games/gomoku/ai/searchConfig'
import type { Board, Player, SearchResult, SearchedCandidate } from '@/games/gomoku/types/gomoku'
import type { StrategyCandidate } from './strategyTypes'

function key(move: { row: number; col: number }) { return `${move.row}:${move.col}` }

export function buildStrategyCandidateSet(
  board: Board,
  player: Player,
  baseline: SearchResult,
  limit: number = SEARCH_CONFIG.strategyCandidateLimit,
): StrategyCandidate[] {
  const pool = generateCandidatePool(board, player, SEARCH_CONFIG.candidatePoolLimit)
  const baselineByKey = new Map(baseline.candidates.map((candidate) => [key(candidate), candidate]))
  const protectedCandidates = pool.filter((candidate) => candidate.immediateWin || candidate.blocksImmediateWin || candidate.forcesReply || candidate.createsDoubleThreat || candidate.createsFourThree)
  const baselineCandidates = baseline.candidates.flatMap((searched) => {
    const candidate = pool.find((item) => key(item) === key(searched))
    if (candidate) return [candidate]
    return board[searched.row]?.[searched.col] === 0
      ? [evaluateCandidate(board, searched.row, searched.col, player)]
      : []
  })
  const attackingCandidates = pool.filter((candidate) => candidate.attackScore > 0 && !candidate.pureDefense)
  const ordered = [...protectedCandidates, ...baselineCandidates, ...attackingCandidates, ...pool]
  const unique = new Map<string, (typeof pool)[number]>()
  for (const candidate of ordered) {
    const isProtected = protectedCandidates.includes(candidate)
    if (!unique.has(key(candidate)) && (unique.size < limit || isProtected)) unique.set(key(candidate), candidate)
  }
  return [...unique.values()].map((candidate) => {
    const baselineCandidate = baselineByKey.get(key(candidate))
    const sources: StrategyCandidate['sources'] = []
    if (candidate.immediateWin) sources.push('immediate_win')
    if (candidate.blocksImmediateWin) sources.push('mandatory_block')
    if (candidate.forcesReply || candidate.createsDoubleThreat || candidate.createsFourThree) sources.push('forcing')
    if (baselineCandidate) sources.push('baseline')
    if (candidate.attackScore > 0 && !candidate.pureDefense) sources.push('attacking')
    return {
      row: candidate.row,
      col: candidate.col,
      attackScore: candidate.attackScore,
      defenseScore: candidate.defenseScore,
      positionalScore: candidate.positionalScore,
      orderingScore: candidate.orderingScore,
      features: [...candidate.features],
      immediateWin: candidate.immediateWin,
      blocksImmediateWin: candidate.blocksImmediateWin,
      forcesReply: candidate.forcesReply,
      createsDoubleThreat: candidate.createsDoubleThreat,
      createsFourThree: candidate.createsFourThree,
      protected: protectedCandidates.includes(candidate),
      sources: sources.length ? sources : ['candidate_pool'],
      ...(baselineCandidate ? { baselineSearchScore: baselineCandidate.searchScore, baselinePrincipalVariation: baselineCandidate.principalVariation.map((move) => ({ ...move })) } : {}),
    }
  })
}

export function strategyCandidateAsSearched(candidate: StrategyCandidate, player: Player): SearchedCandidate {
  return {
    row: candidate.row,
    col: candidate.col,
    staticScore: candidate.orderingScore,
    searchScore: candidate.baselineSearchScore ?? candidate.orderingScore,
    features: [...candidate.features],
    principalVariation: candidate.baselinePrincipalVariation?.map((move) => ({ ...move })) ?? [{ player: player === 1 ? 'black' : 'white', row: candidate.row, col: candidate.col }],
  }
}
