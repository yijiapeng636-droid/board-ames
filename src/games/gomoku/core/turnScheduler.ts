import type { BonusMoves, Player } from '@/games/gomoku/types/gomoku'

export interface TurnAdvanceResult {
  currentPlayer: Player
  bonusMoves: BonusMoves
}

export function advanceTurn(
  mover: Player,
  bonusMoves: BonusMoves,
  humanPlayer: Player = 1,
): TurnAdvanceResult {
  const nextBonus = { ...bonusMoves }
  const key = mover === humanPlayer ? 'human' : 'ai'
  if (nextBonus[key] > 0) {
    nextBonus[key] -= 1
    return { currentPlayer: mover, bonusMoves: nextBonus }
  }
  return { currentPlayer: mover === 1 ? 2 : 1, bonusMoves: nextBonus }
}

export function grantBonus(
  bonusMoves: BonusMoves,
  player: Player,
  humanPlayer: Player = 1,
): { granted: boolean; bonusMoves: BonusMoves } {
  const key = player === humanPlayer ? 'human' : 'ai'
  if (bonusMoves[key] > 0) return { granted: false, bonusMoves: { ...bonusMoves } }
  return { granted: true, bonusMoves: { ...bonusMoves, [key]: 1 } }
}
