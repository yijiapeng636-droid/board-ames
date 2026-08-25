import { describe, expect, it } from 'vitest'
import { advanceTurn, grantBonus } from '@/games/gomoku/core/turnScheduler'

describe('turn scheduler', () => {
  it('alternates normally', () => {
    expect(advanceTurn(1, { human: 0, ai: 0 })).toEqual({
      currentPlayer: 2,
      bonusMoves: { human: 0, ai: 0 },
    })
    expect(advanceTurn(2, { human: 0, ai: 0 }).currentPlayer).toBe(1)
  })

  it('consumes a human bonus before switching to AI', () => {
    const first = advanceTurn(1, { human: 1, ai: 0 })
    expect(first).toEqual({ currentPlayer: 1, bonusMoves: { human: 0, ai: 0 } })
    expect(advanceTurn(1, first.bonusMoves).currentPlayer).toBe(2)
  })

  it('consumes an AI bonus before switching to the human', () => {
    const first = advanceTurn(2, { human: 0, ai: 1 })
    expect(first).toEqual({ currentPlayer: 2, bonusMoves: { human: 0, ai: 0 } })
    expect(advanceTurn(2, first.bonusMoves).currentPlayer).toBe(1)
  })

  it('does not stack an existing bonus', () => {
    expect(grantBonus({ human: 1, ai: 0 }, 1)).toEqual({
      granted: false,
      bonusMoves: { human: 1, ai: 0 },
    })
  })

  it('maps bonuses correctly when the human plays white', () => {
    const afterAI = advanceTurn(1, { human: 0, ai: 1 }, 2)
    expect(afterAI).toEqual({ currentPlayer: 1, bonusMoves: { human: 0, ai: 0 } })
    const afterHuman = advanceTurn(2, { human: 1, ai: 0 }, 2)
    expect(afterHuman).toEqual({ currentPlayer: 2, bonusMoves: { human: 0, ai: 0 } })
  })
})
