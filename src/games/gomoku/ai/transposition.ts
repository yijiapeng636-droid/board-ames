import type { PrincipalVariationMove } from '@/games/gomoku/types/gomoku'

export type TTBound = 'exact' | 'lower' | 'upper'
export interface TTEntry { depth: number; score: number; bound: TTBound; bestMove?: { row: number; col: number }; principalVariation: PrincipalVariationMove[] }
export function classifyTTBound(score: number, alphaOriginal: number, betaOriginal: number): TTBound {
  if (score <= alphaOriginal) return 'upper'
  if (score >= betaOriginal) return 'lower'
  return 'exact'
}
export function applyTTBound(entry: TTEntry, alpha: number, beta: number) {
  if (entry.bound === 'exact') return { alpha, beta, score: entry.score, usable: true }
  const nextAlpha = entry.bound === 'lower' ? Math.max(alpha, entry.score) : alpha
  const nextBeta = entry.bound === 'upper' ? Math.min(beta, entry.score) : beta
  return { alpha: nextAlpha, beta: nextBeta, score: entry.score, usable: nextAlpha >= nextBeta }
}
